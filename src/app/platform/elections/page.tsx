import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Table, Badge, fmtDate, Empty } from "@/components/ui";
import { effectiveStatus, STATUS_LABEL } from "@/lib/lifecycle";

export const metadata = { title: "Elections" };
export default async function Elections() {
  const { ctx } = await requireSuperAdmin();
  const rows = await withCtx(ctx, (tx) => tx`
    select e.id, e.title, e.event_name, e.status, e.starts_at, e.ends_at, e.timezone, e.public_ref, e.secret_ballot, e.purge_after, c.name as college,
      (select count(*)::int from voters v where v.election_id = e.id) as voters,
      (select count(distinct voter_id)::int from participations p where p.election_id = e.id) as participants,
      (select count(*)::int from positions p where p.election_id = e.id) as positions,
      (select count(*)::int from security_events s where s.election_id = e.id and s.requires_review and s.resolved_at is null) as flags
    from elections e join colleges c on c.id = e.college_id order by e.starts_at desc limit 300`);
  return (
    <>
      <PageHeader dark eyebrow="Platform" title="All elections" description="Aggregate status only. Election content is managed by each college's administrators." />
      {rows.length === 0 ? <Empty dark title="No elections yet" /> : (
        <Table dark caption="All elections">
          <thead><tr><th>Election</th><th>College</th><th>Status</th><th>Window</th><th>Positions</th><th>Turnout</th><th>Ballot</th><th>Flags</th><th>Deletion due</th></tr></thead>
          <tbody>{rows.map((e) => { const st = effectiveStatus(e as never); return (
            <tr key={e.id}><td>{e.title}<span className="block font-mono text-xs text-g500">{e.public_ref}</span></td><td className="text-g300">{e.college}</td>
              <td><Badge tone={st}>{STATUS_LABEL[st]}</Badge></td><td className="text-g300 text-xs">{fmtDate(e.starts_at, e.timezone)}<br />{fmtDate(e.ends_at, e.timezone)}</td>
              <td className="tabular">{e.positions}</td><td className="tabular">{e.participants}/{e.voters}</td><td>{e.secret_ballot ? "Secret" : "Open"}</td>
              <td>{e.flags ? <Badge tone="warning">{e.flags}</Badge> : "—"}</td><td className="text-g300 text-xs">{fmtDate(e.purge_after)}</td></tr>); })}
          </tbody>
        </Table>
      )}
    </>
  );
}
