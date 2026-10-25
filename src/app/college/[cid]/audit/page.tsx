import { requireCollegeAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Table, fmtDate } from "@/components/ui";
import { Restricted } from "@/components/restricted";

export const metadata = { title: "Activity log" };
export default async function CollegeAudit({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { ctx } = await requireCollegeAdmin(cid);
  if (ctx.role !== "super_admin") return <><PageHeader eyebrow="Accountability" title="Activity log" /><Restricted what="The activity log" /></>;
  const rows = await withCtx(ctx, (tx) => tx`select a.id, a.at, a.actor_label, a.action, a.target, e.title from audit_events a left join elections e on e.id = a.election_id where a.college_id = ${cid} order by a.id desc limit 300`);
  return (
    <>
      <PageHeader eyebrow="Accountability" title="Activity log" description="Every administrative action at this college. Entries are append-only and hash-chained." />
      <Table caption="College activity">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Election</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs text-g600">{fmtDate(r.at)}</td><td className="text-xs">{r.actor_label}</td><td><span className="font-mono text-[0.78rem]">{r.action}</span>{r.target && <span className="block text-xs text-g500">{r.target}</span>}</td><td className="text-sm">{r.title ?? "—"}</td></tr>)}</tbody>
      </Table>
    </>
  );
}
