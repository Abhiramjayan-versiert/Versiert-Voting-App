import Link from "next/link";
import { loadElection } from "@/lib/election-page";
import { withCtx } from "@/lib/db";
import { readiness } from "@/lib/elections";
import { env } from "@/lib/env";
import { Card, Stat, Notice, ButtonLink, fmtDate, relTime, Field, Input } from "@/components/ui";
import { Confirm, CopyButton, ActionForm, SubmitButton } from "@/components/forms";
import { lifecycleAction, deleteDraftAction } from "@/app/college/actions";
import { deleteAnyElectionAction } from "@/app/platform/actions";
import { utcToZonedInput } from "@/lib/action-utils";
import { pct } from "@/lib/results";

const pill = "inline-flex h-10 items-center rounded-full border border-g300 px-4 text-sm font-medium hover:border-ink";
export const metadata = { title: "Election overview" };

export default async function Overview({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { s, ctx, e, base } = await loadElection(cid, eid);
  const isSuper = s.user.role === "super_admin";
  const st = e.effective as string;
  const r = await readiness(ctx, eid);
  const [stats] = await withCtx(ctx, (tx) => tx`select
    (select count(*)::int from voters where election_id = ${eid}) as voters,
    (select count(distinct voter_id)::int from participations where election_id = ${eid}) as participants,
    (select count(*)::int from candidates where election_id = ${eid}) as candidates,
    (select count(*)::int from notifications where election_id = ${eid} and status = 'pending') as queued,
    (select count(*)::int from security_events where election_id = ${eid} and requires_review and resolved_at is null) as flags`);
  const link = `${env().APP_URL}/e/${e.slug}`;
  const resultsLink = `${env().APP_URL}/r/${e.public_ref}`;
  const H = { election_id: eid };

  return (
    <div className="space-y-6">
      {st === "draft" && (r.ok
        ? <Notice tone="success" title="Ready to activate">Everything required is in place. Review the summary, then activate.</Notice>
        : <Notice tone="info" title="Setup in progress"><ul className="mt-1 list-disc pl-5">{r.issues.map((i) => <li key={i}>{i}</li>)}</ul></Notice>)}
      {st === "paused" && <Notice tone="warning" title="Voting is paused">Voters cannot submit ballots. While paused you may add voters or withdraw a candidate (audit-logged). Votes already cast are kept unchanged.</Notice>}
      {stats.flags > 0 && <Notice tone="warning" title={`${stats.flags} unresolved integrity incident(s)`}>Results can't be published until they're resolved. <Link href={`${base}/results`} className="underline">Review</Link></Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Eligible voters" value={stats.voters.toLocaleString("en-IN")} />
        <Stat accent={st === "open"} label="Participated" value={stats.participants.toLocaleString("en-IN")} sub={`${pct(stats.participants, stats.voters).toFixed(1)}% turnout`} />
        <Stat label="Positions" value={r.positions.length} sub={`${stats.candidates} candidates`} />
        <Stat label={st === "scheduled" ? "Opens" : st === "open" || st === "paused" ? "Closes" : st === "draft" ? "Planned opening" : "Closed"}
          value={<span className="text-lg">{relTime(["scheduled", "draft"].includes(st) ? e.starts_at : e.closed_at ?? e.ends_at)}</span>}
          sub={fmtDate(["scheduled", "draft"].includes(st) ? e.starts_at : e.closed_at ?? e.ends_at, e.timezone)} />
      </div>

      <Card>
        <h2 className="font-semibold">Next steps</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {st === "draft" && <>
            <ButtonLink href={`${base}/details`} variant="dark">Continue setup</ButtonLink>
            {r.ok && <ButtonLink href={`${base}/review`} variant="primary">Review & activate</ButtonLink>}
            <Confirm triggerClass={pill} trigger="Delete draft" title="Delete this draft election?" tone="danger" confirmLabel="Delete" body={<p>The draft, its voter list, positions and candidates are permanently deleted.</p>} action={deleteDraftAction} hidden={H} requireText="DELETE" />
          </>}
          {st === "scheduled" && <>
            <Confirm triggerClass={pill} trigger="Return to draft" title="Return to draft?" confirmLabel="Return to draft" body={<p>The election won't open until you activate it again.</p>} action={lifecycleAction} hidden={{ ...H, op: "draft" }} />
          </>}
          {(st === "scheduled" || st === "open") && <>
            <Confirm triggerClass={pill} trigger="Email invitations" title="Email every voter an invitation?" confirmLabel="Queue invitations" body={<p>{stats.voters} emails will be queued with the election link and times. Each address is emailed at most once.</p>} action={lifecycleAction} hidden={{ ...H, op: "invite" }} />
          </>}
          {st === "open" && <>
            <ButtonLink href={`${base}/monitor`} variant="primary">Live monitor</ButtonLink>
            <Confirm triggerClass={pill} trigger="Send closing reminder" title="Remind voters who haven't voted?" confirmLabel="Queue reminders" body={<p>Only voters with no recorded participation are emailed. Emails never mention choices.</p>} action={lifecycleAction} hidden={{ ...H, op: "remind" }} />
            <Confirm triggerClass={pill} trigger="Pause voting" title="Pause voting?" tone="danger" confirmLabel="Pause" body={<p>Use only for emergencies (wrong candidate details, voter list errors). Active voter sessions end immediately.</p>} action={lifecycleAction} hidden={{ ...H, op: "pause" }} reasonLabel="Reason (shown in the audit log)" />
          </>}
          {st === "paused" && (
            <div className="w-full rounded-xl border border-g200 p-4">
              <ActionForm action={lifecycleAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="election_id" value={eid} /><input type="hidden" name="op" value="resume" />
                <div className="flex-1"><Field label={`Closing time (${e.timezone}), extend if needed`} htmlFor="ends_at"><Input id="ends_at" name="ends_at" type="datetime-local" defaultValue={utcToZonedInput(e.ends_at, e.timezone)} /></Field></div>
                <SubmitButton variant="primary">Resume voting</SubmitButton>
              </ActionForm>
              <div className="mt-3 flex flex-wrap gap-2"><ButtonLink href={`${base}/voters`} variant="outline" size="sm">Add voters</ButtonLink><ButtonLink href={`${base}/positions`} variant="outline" size="sm">Candidate status</ButtonLink></div>
            </div>
          )}
          {(st === "open" || st === "paused") && <Confirm triggerClass={pill} trigger="Close voting now" title="Close voting early?" tone="danger" confirmLabel="Close voting" body={<p>No further ballots will be accepted. This can't be undone.</p>} action={lifecycleAction} hidden={{ ...H, op: "close" }} reasonLabel="Reason" />}
          {(st === "open" || st === "paused" || st === "scheduled") && <Confirm triggerClass={pill} trigger="Report an incident" title="Record an integrity incident" confirmLabel="Record incident" body={<p>Publication will be blocked until an administrator resolves it with a written note.</p>} action={lifecycleAction} hidden={{ ...H, op: "flag" }} reasonLabel="What happened?" />}
          {["results_pending", "closed"].includes(st) && <ButtonLink href={`${base}/results`} variant="primary">Review results</ButtonLink>}
          {["published", "retention"].includes(st) && <><ButtonLink href={`/r/${e.public_ref}`} variant="primary">Public results page</ButtonLink><ButtonLink href={`${base}/exports`} variant="outline">Exports</ButtonLink></>}
        </div>
        {stats.queued > 0 && <p className="mt-3 text-xs text-g500">{stats.queued} email(s) queued for delivery.</p>}
      </Card>

      {st !== "draft" && st !== "deleted" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-semibold">Voting link</h2>
            <p className="mt-1 text-sm text-g500">Share with eligible students. They verify their email before voting.</p>
            <p className="mt-3 break-all rounded-lg bg-g50 px-3 py-2 font-mono text-sm">{link}</p>
            <div className="mt-3 flex gap-2"><CopyButton text={link} /><a href={`/e/${e.slug}`} target="_blank" className={pill.replace("h-10", "h-9")}>Open</a></div>
          </Card>
          <Card>
            <h2 className="font-semibold">Results link</h2>
            <p className="mt-1 text-sm text-g500">{["published", "retention"].includes(st) ? "Public. Shows aggregate results only." : "Becomes available once you publish results."}</p>
            <p className="mt-3 break-all rounded-lg bg-g50 px-3 py-2 font-mono text-sm">{resultsLink}</p>
            <div className="mt-3"><CopyButton text={resultsLink} /></div>
          </Card>
        </div>
      )}
      {["published", "retention"].includes(st) && e.purge_after && (
        <Notice tone="info" title="Data retention">
          Voter list, verification records and ballot data will be deleted on <strong>{fmtDate(e.purge_after, e.timezone)}</strong> ({e.retention_days}-day policy). {e.keep_public_results ? "The aggregate results page will remain available." : "The results page will also be removed."} You'll get an email {`a few days`} before.
        </Notice>
      )}
      {isSuper && st !== "draft" && (
        <div className="rounded-[var(--radius-card)] border border-[#fecdca] p-5">
          <h2 className="font-semibold text-danger">Super Admin: delete this election</h2>
          <p className="mt-1 text-sm text-g600">Permanently removes the election and all its data, whatever its status. Audit-logged with your reason.</p>
          <div className="mt-3"><Confirm triggerClass={pill} trigger="Delete election permanently" title="Permanently delete this election?" tone="danger" confirmLabel="Delete permanently"
            body={<p>The voter list, positions, candidates, ballots and results are deleted for good. This cannot be undone.</p>}
            action={deleteAnyElectionAction} hidden={{ election_id: eid, return_to: "college" }} requireText={e.public_ref} reasonLabel="Reason (audit-logged)" /></div>
        </div>
      )}
      {st === "deleted" && <Notice tone="info" title="Election data deleted">This election's personal data and ballots were deleted under the retention policy on {fmtDate(e.deleted_at, e.timezone)}.</Notice>}
    </div>
  );
}
