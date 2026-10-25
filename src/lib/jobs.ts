import "server-only";
import { sql, withCtx, systemCtx } from "./db";
import { audit } from "./audit";
import { publish, UserError } from "./elections";
import { queueNotification, deliverQueued } from "./mailer";
import { getConfig } from "./config";
import { pruneRateLimits } from "./ratelimit";
import { env } from "./env";

async function track<T extends Record<string, unknown>>(job: string, fn: () => Promise<T>) {
  const [run] = await sql()`insert into job_runs (job) values (${job}) returning id`;
  try {
    const details = await fn();
    await sql()`update job_runs set status = 'succeeded', finished_at = now(), details = ${sql().json(details as never)} where id = ${run.id}`;
    return details;
  } catch (err) {
    await sql()`update job_runs set status = 'failed', finished_at = now(), details = ${sql().json({ error: (err as Error).message } as never)} where id = ${run.id}`;
    throw err;
  }
}

const SYSTEM_ACTOR = { id: "00000000-0000-0000-0000-000000000000", label: "system:cron" };
export const CORRECTION_WINDOW_HOURS = 24;

/** Advances time-based lifecycle states. Idempotent, safe to run every minute. */
export function lifecycleTick() {
  return track("lifecycle", async () => {
    return withCtx(systemCtx, async (tx) => {
      const opened = await tx`update elections set status = 'open' where status = 'scheduled' and starts_at <= now() and ends_at > now() returning id, college_id`;
      for (const e of opened) await audit({ actorLabel: "system:cron", collegeId: e.college_id, electionId: e.id, action: "election.opened" }, tx);
      const closed = await tx`update elections set status = 'results_pending', closed_at = coalesce(closed_at, now())
                               where status in ('scheduled', 'open') and ends_at <= now() returning id, college_id, results_require_approval, title`;
      for (const e of closed) {
        await audit({ actorLabel: "system:cron", collegeId: e.college_id, electionId: e.id, action: "election.closed" }, tx);
        await tx`update voter_sessions set revoked_at = now() where election_id = ${e.id} and revoked_at is null`;
      }
      const toRetention = await tx`update elections set status = 'retention'
                                    where status = 'published' and published_at <= now() - make_interval(hours => ${CORRECTION_WINDOW_HOURS}) returning id, college_id`;
      for (const e of toRetention) await audit({ actorLabel: "system:cron", collegeId: e.college_id, electionId: e.id, action: "election.retention_started" }, tx);
      return { opened: opened.length, closed: closed.length, toRetention: toRetention.length, autoPublishCandidates: closed.filter((c) => !c.results_require_approval).map((c) => c.id as string) };
    }).then(async (r) => {
      // Auto-publish only where the election was configured not to require approval AND integrity passes.
      const pending = await withCtx(systemCtx, (tx) => tx`select id from elections where status = 'results_pending' and results_require_approval = false`);
      let autoPublished = 0, autoBlocked = 0;
      for (const p of pending) {
        try { await publish(systemCtx, SYSTEM_ACTOR, p.id, { auto: true }); autoPublished++; }
        catch (err) { if (err instanceof UserError) autoBlocked++; else throw err; }
      }
      const { autoPublishCandidates: _, ...rest } = r;
      return { ...rest, autoPublished, autoBlocked };
    });
  });
}

/** Retention: pre-deletion notices, purge, verification, receipts. Idempotent and retryable. */
export function retentionRun(opts: { onlyElectionId?: string; force?: boolean } = {}) {
  return track("retention", async () => {
    const cfg = await getConfig();
    let notified = 0, purged = 0, failed = 0;
    const notices = await withCtx(systemCtx, (tx) => tx`
      select j.id, j.election_id, j.college_id, j.run_after, e.title, e.keep_public_results, e.public_ref
        from cleanup_jobs j join elections e on e.id = j.election_id
       where j.status = 'scheduled' and j.run_after <= now() + make_interval(days => ${cfg.pre_deletion_notice_days})`);
    for (const n of notices) {
      const admins = await withCtx(systemCtx, (tx) => tx`select u.email from college_admins ca join users u on u.id = ca.user_id where ca.college_id = ${n.college_id} and u.status = 'active'`);
      for (const a of admins) {
        await queueNotification({ to: a.email, kind: "pre_deletion_notice", collegeId: n.college_id, electionId: n.election_id, dedupeKey: `predel:${n.id}:${a.email}`,
          subject: `Scheduled data deletion, ${n.title}`,
          text: `Under the retention policy for "${n.title}", the voter list, verification records and ballot data will be permanently deleted on or after ${new Date(n.run_after).toUTCString()}.\n\n${n.keep_public_results ? `The published aggregate results (${env().APP_URL}/r/${n.public_ref}) will remain available.` : "The published results page will also be removed."}\n\nExport any reports you need before then., V.app` });
      }
      await withCtx(systemCtx, (tx) => tx`update cleanup_jobs set status = 'notified', notified_at = now() where id = ${n.id} and status = 'scheduled'`);
      notified++;
    }

    const due = await withCtx(systemCtx, (tx) => opts.onlyElectionId
      ? tx`select j.*, e.public_ref, e.keep_public_results, e.status as election_status from cleanup_jobs j join elections e on e.id = j.election_id
            where j.election_id = ${opts.onlyElectionId} and j.status <> 'completed'`
      : tx`select j.*, e.public_ref, e.keep_public_results, e.status as election_status from cleanup_jobs j join elections e on e.id = j.election_id
            where j.status in ('scheduled', 'notified', 'failed') and j.run_after <= now() and j.attempts < 10 order by j.run_after limit 20`);

    for (const j of due) {
      try {
        await withCtx(systemCtx, (tx) => tx`update cleanup_jobs set status = 'running', started_at = now(), attempts = attempts + 1 where id = ${j.id}`);
        if (j.election_status === "published") {
          // Move into retention first if the correction window was skipped (e.g. forced test run).
          await withCtx(systemCtx, (tx) => tx`update elections set status = 'retention' where id = ${j.election_id} and status = 'published'`);
        }
        const counts = await withCtx(systemCtx, async (tx) => {
          const [r] = await tx`select ballot.purge_election(${j.election_id}, ${opts.force ?? false}) as c`;
          return r.c as Record<string, number>;
        });
        const [left] = await withCtx(systemCtx, (tx) => tx`select ballot.purge_leftovers(${j.election_id}) as l`);
        const leftovers = left.l as Record<string, number>;
        const verified = Object.values(leftovers).every((v) => Number(v) === 0);
        await withCtx(systemCtx, async (tx) => {
          await tx`insert into deletion_receipts (election_ref, college_id, election_id, kept_aggregate, counts, verified)
                   values (${j.public_ref}, ${j.college_id}, ${j.election_id}, ${j.keep_public_results}, ${tx.json({ ...counts, leftovers } as never)}, ${verified})`;
          await tx`update cleanup_jobs set status = ${verified ? "completed" : "failed"}, finished_at = now(), processed = ${tx.json(counts as never)},
                     last_error = ${verified ? null : "Verification found leftover records"} where id = ${j.id}`;
          await audit({ actorLabel: "system:retention", collegeId: j.college_id, electionId: j.election_id, action: "retention.purge", details: { counts, verified } }, tx);
        });
        verified ? purged++ : failed++;
      } catch (err) {
        failed++;
        await withCtx(systemCtx, (tx) => tx`update cleanup_jobs set status = 'failed', last_error = ${(err as Error).message.slice(0, 300)}, finished_at = now() where id = ${j.id}`);
      }
    }

    // Housekeeping of short-lived authentication data.
    const h = await withCtx(systemCtx, async (tx) => ({
      otp: (await tx`delete from otp_challenges where expires_at < now() - interval '1 day'`).count,
      voterSessions: (await tx`delete from voter_sessions where expires_at < now() - interval '1 day'`).count,
      adminSessions: (await tx`delete from sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days'`).count,
      tokens: (await tx`delete from auth_tokens where expires_at < now() - interval '7 days'`).count,
      devMailbox: (await tx`delete from dev_mailbox where created_at < now() - interval '7 days'`).count,
    }));
    const rl = await pruneRateLimits();
    return { notified, purged, failed, housekeeping: { ...h, rateLimits: rl } };
  });
}

export function deliveryRun() {
  return track("notifications", async () => deliverQueued(100));
}
