import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import Link from "next/link";
import { PageHeader, Table, Badge, fmtDate, Empty, Notice } from "@/components/ui";
import { Confirm } from "@/components/forms";
import { deleteAnyElectionAction } from "../actions";
import { effectiveStatus, STATUS_LABEL } from "@/lib/lifecycle";

export const metadata = { title: "Elections" };
export default async function Elections({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { ctx } = await requireSuperAdmin();
  const colleges = await withCtx(ctx, (tx) => tx`select id, name from colleges where status = 'active' order by name`);
  const rows = await withCtx(ctx, (tx) => tx`
    select e.id, e.college_id, e.title, e.event_name, e.status, e.starts_at, e.ends_at, e.timezone, e.public_ref, e.secret_ballot, e.purge_after, c.name as college,
      (select count(*)::int from voters v where v.election_id = e.id) as voters,
      (select count(distinct voter_id)::int from participations p where p.election_id = e.id) as participants,
      (select count(*)::int from positions p where p.election_id = e.id) as positions,
      (select count(*)::int from security_events s where s.election_id = e.id and s.requires_review and s.resolved_at is null) as flags
    from elections e join colleges c on c.id = e.college_id order by e.starts_at desc limit 300`);
  return (
    <>
      {sp.deleted && <Notice tone="success" className="mb-5">Election permanently deleted. A deletion receipt was recorded.</Notice>}
      <PageHeader dark eyebrow="Platform" title="All elections" description="Full access: open any election to edit it, run it, publish results or export reports. Every action is audit-logged." />
      {colleges.length > 0 && (
        <div className="mb-6 rounded-[var(--radius-card)] border border-g700 p-4">
          <p className="mb-3 text-sm font-medium">Create a new election for</p>
          <div className="flex flex-wrap gap-2">{colleges.map((c) => <Link key={c.id} href={`/college/${c.id}/elections/new`} className="inline-flex h-9 items-center rounded-full bg-lime px-4 text-sm font-medium text-ink hover:bg-lime-deep">+ {c.name}</Link>)}</div>
        </div>
      )}
      {rows.length === 0 ? <Empty dark title="No elections yet" /> : (
        <Table dark caption="All elections">
          <thead><tr><th>Election</th><th>College</th><th>Status</th><th>Window</th><th>Positions</th><th>Turnout</th><th>Ballot</th><th>Flags</th><th>Deletion due</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((e) => { const st = effectiveStatus(e as never); return (
            <tr key={e.id}><td><Link href={`/college/${e.college_id}/elections/${e.id}`} className="font-medium hover:text-lime">{e.title}</Link><span className="block font-mono text-xs text-g500">{e.public_ref}</span></td><td className="text-g300">{e.college}</td>
              <td><Badge tone={st}>{STATUS_LABEL[st]}</Badge></td><td className="text-g300 text-xs">{fmtDate(e.starts_at, e.timezone)}<br />{fmtDate(e.ends_at, e.timezone)}</td>
              <td className="tabular">{e.positions}</td><td className="tabular">{e.participants}/{e.voters}</td><td>{e.secret_ballot ? "Secret" : "Open"}</td>
              <td>{e.flags ? <Badge tone="warning">{e.flags}</Badge> : "—"}</td><td className="text-g300 text-xs">{fmtDate(e.purge_after)}</td>
              <td className="whitespace-nowrap text-xs">
                <Link href={`/college/${e.college_id}/elections/${e.id}`} className="mr-3 text-lime underline">Manage</Link>
                <Link href={`/college/${e.college_id}/elections/${e.id}/results`} className="mr-3 text-g300 underline hover:text-lime">Results</Link>
                <Confirm triggerClass="text-[#ff9b94] underline" trigger="Delete" title={`Permanently delete “${e.title}”?`} tone="danger" confirmLabel="Delete permanently"
                  body={<><p>The election, its voter list, positions, candidates, ballots and results are deleted for good. This cannot be undone.</p>{["open", "paused"].includes(st) && <p className="font-medium text-danger">Voting is in progress — students will lose access immediately.</p>}</>}
                  action={deleteAnyElectionAction} hidden={{ election_id: e.id }} requireText={e.public_ref} reasonLabel="Reason (audit-logged)" />
              </td></tr>); })}
          </tbody>
        </Table>
      )}
    </>
  );
}
