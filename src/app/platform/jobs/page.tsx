import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Table, Badge, fmtDate, relTime, Card, Stat } from "@/components/ui";
import { ActionForm, SubmitButton, Confirm } from "@/components/forms";
import { runJobAction, retryCleanupAction, forceDeleteElectionAction } from "../actions";

export const metadata = { title: "Jobs & cleanup" };
export default async function Jobs() {
  const { ctx } = await requireSuperAdmin();
  const d = await withCtx(ctx, async (tx) => ({
    cleanup: await tx`select j.*, e.title, e.public_ref, e.status as election_status, c.name as college from cleanup_jobs j join elections e on e.id = j.election_id join colleges c on c.id = j.college_id order by j.run_after`,
    receipts: await tx`select r.*, c.name as college from deletion_receipts r left join colleges c on c.id = r.college_id order by completed_at desc limit 20`,
    runs: await tx`select * from job_runs order by started_at desc limit 25`,
    imports: await tx`select i.filename, i.status, i.error, i.total_rows, i.accepted, i.rejected, i.duplicates, i.created_at, c.name as college, e.title from voter_imports i join colleges c on c.id = i.college_id join elections e on e.id = i.election_id order by i.created_at desc limit 20`,
    notif: await tx`select status, count(*)::int as n from notifications group by status`,
    lastRetention: await tx`select max(finished_at) as t from job_runs where job = 'retention' and status = 'succeeded'`,
  }));
  const count = (s: string) => d.cleanup.filter((j) => j.status === s).length;
  const n = (s: string) => d.notif.find((x) => x.status === s)?.n ?? 0;
  return (
    <>
      <PageHeader dark eyebrow="Oversight" title="Jobs & cleanup" description="Scheduled lifecycle transitions, notification delivery and retention deletion. All jobs are idempotent and safe to re-run." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat dark label="Pending deletions" value={count("scheduled") + count("notified")} />
        <Stat dark label="Completed deletions" value={count("completed")} />
        <Stat dark label="Failed deletions" value={count("failed")} />
        <Stat dark label="Emails queued / failed" value={`${n("pending")} / ${n("failed")}`} />
        <Stat dark label="Last cleanup run" value={<span className="text-lg">{relTime(d.lastRetention[0]?.t)}</span>} />
      </div>
      <Card dark className="mt-6">
        <h2 className="mb-3 font-semibold">Run a job now</h2>
        <div className="flex flex-wrap gap-2">
          {[["lifecycle", "Lifecycle tick"], ["notifications", "Deliver emails"], ["retention", "Retention cleanup"]].map(([j, l]) => (
            <ActionForm key={j} action={runJobAction}><input type="hidden" name="job" value={j} /><SubmitButton variant="outline-dark" size="sm">{l}</SubmitButton></ActionForm>
          ))}
        </div>
        <p className="mt-3 text-xs text-g500">In production these run from Vercel Cron (see vercel.json). Retention only deletes elections whose retention period has expired.</p>
      </Card>
      <h2 className="mb-3 mt-8 font-semibold">Scheduled deletions</h2>
      <Table dark caption="Cleanup jobs">
        <thead><tr><th>Election</th><th>Status</th><th>Due</th><th>Attempts</th><th>Processed</th><th></th></tr></thead>
        <tbody>{d.cleanup.length === 0 ? <tr><td colSpan={6} className="text-g400">No deletions scheduled.</td></tr> : d.cleanup.map((j) => (
          <tr key={j.id}><td>{j.title}<span className="block text-xs text-g500">{j.college} · <span className="font-mono">{j.public_ref}</span></span></td>
            <td><Badge tone={j.status}>{j.status}</Badge>{j.last_error && <span className="block text-xs text-[#ff9b94]">{j.last_error}</span>}</td>
            <td className="text-xs text-g300">{fmtDate(j.run_after)}<span className="block text-g500">{relTime(j.run_after)}</span></td><td className="tabular">{j.attempts}</td>
            <td className="font-mono text-[0.7rem] text-g400">{Object.keys(j.processed).length ? Object.entries(j.processed).map(([k, v]) => `${k}:${v}`).join(" ") : "-"}</td>
            <td className="whitespace-nowrap">
              {j.status === "failed" && <ActionForm action={retryCleanupAction}><input type="hidden" name="election_id" value={j.election_id} /><SubmitButton variant="outline-dark" size="sm">Retry</SubmitButton></ActionForm>}
              {["scheduled", "notified"].includes(j.status) && <Confirm triggerClass="text-xs text-[#ffd27a] underline" trigger="Delete now" title="Permanently delete this election's data now?" tone="danger" confirmLabel="Delete permanently"
                body={<><p>Voter list, verification records, participation and ballot data are deleted now instead of on the scheduled date. {`This can't be undone.`}</p><p>Database backups expire on the provider's own schedule.</p></>}
                action={forceDeleteElectionAction} hidden={{ election_id: j.election_id }} requireText={j.public_ref} reasonLabel="Reason (audit-logged)" />}
            </td></tr>))}
        </tbody>
      </Table>
      <h2 className="mb-3 mt-8 font-semibold">Deletion receipts</h2>
      <Table dark caption="Deletion receipts">
        <thead><tr><th>Completed</th><th>Election ref</th><th>College</th><th>Aggregate kept</th><th>Verified</th><th>Records removed</th></tr></thead>
        <tbody>{d.receipts.length === 0 ? <tr><td colSpan={6} className="text-g400">No deletions yet.</td></tr> : d.receipts.map((r) => (
          <tr key={r.id}><td className="text-xs text-g300">{fmtDate(r.completed_at)}</td><td className="font-mono">{r.election_ref}</td><td className="text-g300">{r.college}</td><td>{r.kept_aggregate ? "Yes" : "No"}</td>
            <td><Badge tone={r.verified ? "completed" : "failed"}>{r.verified ? "verified" : "leftovers"}</Badge></td>
            <td className="font-mono text-[0.7rem] text-g400">{Object.entries(r.counts).filter(([k]) => k !== "leftovers").map(([k, v]) => `${k}:${v}`).join(" ")}</td></tr>))}
        </tbody>
      </Table>
      <h2 className="mb-3 mt-8 font-semibold">Voter imports</h2>
      <Table dark caption="Voter imports">
        <thead><tr><th>When</th><th>File</th><th>Election</th><th>Status</th><th>Rows</th></tr></thead>
        <tbody>{d.imports.map((i, k) => (
          <tr key={k}><td className="text-xs text-g300">{fmtDate(i.created_at)}</td><td className="max-w-[14rem] truncate">{i.filename}</td><td className="text-g300">{i.title}<span className="block text-xs text-g500">{i.college}</span></td>
            <td><Badge tone={i.status}>{i.status}</Badge>{i.error && <span className="block text-xs text-[#ff9b94]">{i.error}</span>}</td><td className="text-xs tabular">{i.total_rows} total · {i.accepted} ok · {i.rejected} rejected · {i.duplicates} dup</td></tr>))}
        </tbody>
      </Table>
      <h2 className="mb-3 mt-8 font-semibold">Recent job runs</h2>
      <Table dark caption="Job runs">
        <thead><tr><th>Started</th><th>Job</th><th>Status</th><th>Duration</th><th>Result</th></tr></thead>
        <tbody>{d.runs.map((r) => (
          <tr key={r.id}><td className="text-xs text-g300">{fmtDate(r.started_at)}</td><td className="font-mono">{r.job}</td><td><Badge tone={r.status}>{r.status}</Badge></td>
            <td className="tabular text-xs">{r.finished_at ? `${new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()} ms` : "-"}</td>
            <td className="max-w-md break-words font-mono text-[0.7rem] text-g400">{JSON.stringify(r.details)}</td></tr>))}
        </tbody>
      </Table>
    </>
  );
}
