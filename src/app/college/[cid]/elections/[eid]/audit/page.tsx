import { loadElection } from "@/lib/election-page";
import { withCtx } from "@/lib/db";
import { Table, fmtDate, Empty } from "@/components/ui";

export const metadata = { title: "Election activity" };
export default async function ElectionAudit({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { ctx, e } = await loadElection(cid, eid);
  const rows = await withCtx(ctx, (tx) => tx`select id, at, actor_label, action, target, details from audit_events where election_id = ${eid} order by id desc limit 300`);
  if (!rows.length) return <Empty title="No activity yet" />;
  return (
    <Table caption="Election activity">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}><td className="whitespace-nowrap text-xs text-g600">{fmtDate(r.at, e.timezone)}</td><td className="text-xs">{r.actor_label}</td>
          <td><span className="font-mono text-[0.78rem]">{r.action}</span>{r.target && <span className="block text-xs text-g500">{r.target}</span>}</td>
          <td className="max-w-sm break-words font-mono text-[0.7rem] text-g500">{JSON.stringify(r.details) === "{}" ? "" : JSON.stringify(r.details)}</td></tr>))}
      </tbody>
    </Table>
  );
}
