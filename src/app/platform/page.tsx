import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Stat, Card, Badge, Table, relTime, Empty } from "@/components/ui";
import { STATUS_LABEL, effectiveStatus } from "@/lib/lifecycle";

export const metadata = { title: "Overview" };

export default async function PlatformHome() {
  const { ctx } = await requireSuperAdmin();
  const d = await withCtx(ctx, async (tx) => {
    const [c] = await tx`select
      (select count(*)::int from colleges) as colleges,
      (select count(*)::int from colleges where status = 'suspended') as colleges_suspended,
      (select count(*)::int from users where role = 'college_admin' and status in ('active','invited')) as admins,
      (select count(*)::int from voters) as voters,
      (select count(*)::int from result_snapshots) as snapshots,
      (select count(*)::int from voter_imports where status = 'failed' and created_at > now() - interval '7 days') as failed_imports,
      (select count(*)::int from cleanup_jobs where status = 'failed') as failed_cleanups,
      (select count(*)::int from cleanup_jobs where status in ('scheduled','notified')) as pending_cleanups,
      (select count(*)::int from job_runs where status = 'failed' and started_at > now() - interval '7 days') as failed_jobs,
      (select count(*)::int from security_events where resolved_at is null and severity <> 'info') as open_security,
      pg_database_size(current_database())::bigint as db_bytes`;
    const elections = await tx`select id, status, starts_at, ends_at from elections`;
    const recentSec = await tx`select s.at, s.kind, s.severity, c.name as college from security_events s left join colleges c on c.id = s.college_id order by s.at desc limit 6`;
    const recentAudit = await tx`select at, actor_label, action, target from audit_events order by id desc limit 8`;
    const jobs = await tx`select distinct on (job) job, status, started_at, finished_at from job_runs order by job, started_at desc`;
    return { c, elections, recentSec, recentAudit, jobs };
  });
  const counts: Record<string, number> = {};
  for (const e of d.elections) { const s = effectiveStatus(e as never); counts[s] = (counts[s] ?? 0) + 1; }
  const completed = (counts.results_pending ?? 0) + (counts.closed ?? 0) + (counts.published ?? 0) + (counts.retention ?? 0) + (counts.deleted ?? 0);
  const mb = (Number(d.c.db_bytes) / 1048576).toFixed(1);
  const alerts = [
    d.c.open_security && { t: `${d.c.open_security} open security event(s)`, href: "/platform/security" },
    d.c.failed_cleanups && { t: `${d.c.failed_cleanups} failed cleanup job(s)`, href: "/platform/jobs" },
    d.c.failed_jobs && { t: `${d.c.failed_jobs} failed background run(s) this week`, href: "/platform/jobs" },
    d.c.failed_imports && { t: `${d.c.failed_imports} failed voter import(s) this week`, href: "/platform/jobs" },
  ].filter(Boolean) as { t: string; href: string }[];

  return (
    <>
      <PageHeader dark eyebrow="Developer console" title="Platform overview" description="Everything running on V.app, at a glance. Individual ballot choices are never visible here." />
      {alerts.length > 0 && (
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {alerts.map((a) => <Link key={a.t} href={a.href} className="flex items-center justify-between rounded-xl border border-[#6b4a00] bg-[#1f1600] px-4 py-3 text-sm text-[#ffd27a] hover:border-[#ffd27a]">{a.t}<span aria-hidden>→</span></Link>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat dark label="Colleges" value={d.c.colleges} sub={d.c.colleges_suspended ? `${d.c.colleges_suspended} suspended` : "All active"} />
        <Stat dark label="College administrators" value={d.c.admins} />
        <Stat dark label="Eligible voters (all elections)" value={d.c.voters.toLocaleString("en-IN")} />
        <Stat accent label="Active elections" value={counts.open ?? 0} sub={`${counts.paused ?? 0} paused`} />
        <Stat dark label="Scheduled" value={counts.scheduled ?? 0} sub={`${counts.draft ?? 0} draft${(counts.draft ?? 0) === 1 ? "" : "s"}`} />
        <Stat dark label="Completed" value={completed} sub={`${counts.results_pending ?? 0} awaiting review`} />
        <Stat dark label="Published result snapshots" value={d.c.snapshots} />
        <Stat dark label="Database size" value={`${mb} MB`} sub={`${d.c.pending_cleanups} deletion(s) scheduled`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card dark>
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Recent security events</h2><Link href="/platform/security" className="text-sm text-g400 hover:text-lime">View all</Link></div>
          {d.recentSec.length === 0 ? <Empty dark title="No security events" /> : (
            <ul className="divide-y divide-g800">
              {d.recentSec.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate">{s.kind.replace(/_/g, " ")}</span><span className="text-xs text-g500">{s.college ?? "Platform"} · {relTime(s.at)}</span></span>
                  <Badge tone={s.severity}>{s.severity}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card dark>
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Recent administrative activity</h2><Link href="/platform/audit" className="text-sm text-g400 hover:text-lime">Audit log</Link></div>
          <ul className="divide-y divide-g800">
            {d.recentAudit.map((r, i) => (
              <li key={i} className="py-2.5 text-sm">
                <span className="font-mono text-[0.8rem] text-lime">{r.action}</span> {r.target && <span className="text-g300">· {r.target}</span>}
                <span className="block text-xs text-g500">{r.actor_label} · {relTime(r.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card dark className="mt-6">
        <h2 className="mb-4 font-semibold">Background jobs</h2>
        <Table dark caption="Last run of each background job">
          <thead><tr><th>Job</th><th>Last run</th><th>Status</th></tr></thead>
          <tbody>
            {["lifecycle", "notifications", "retention"].map((j) => {
              const r = d.jobs.find((x) => x.job === j);
              return <tr key={j}><td className="font-mono">{j}</td><td>{r ? relTime(r.started_at) : "never"}</td><td>{r ? <Badge tone={r.status}>{r.status}</Badge> : <Badge tone="pending">not run</Badge>}</td></tr>;
            })}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-g500">Status labels: {Object.values(STATUS_LABEL).join(" → ")}</p>
      </Card>
    </>
  );
}
