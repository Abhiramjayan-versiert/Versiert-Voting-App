import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Table, Badge, ButtonLink, Empty, Notice } from "@/components/ui";

export const metadata = { title: "Colleges" };
export default async function Colleges({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { ctx } = await requireSuperAdmin();
  const rows = await withCtx(ctx, (tx) => tx`
    select c.id, c.code, c.name, c.city, c.status, c.default_retention_days,
      (select count(*)::int from college_admins ca join users u on u.id = ca.user_id where ca.college_id = c.id and u.status in ('active','invited')) as admins,
      (select count(*)::int from elections e where e.college_id = c.id) as elections,
      (select count(*)::int from elections e where e.college_id = c.id and e.status in ('open','scheduled','paused')) as live
    from colleges c order by c.name`);
  return (
    <>
      {sp.deleted && <Notice tone="success" className="mb-5">College deleted permanently, with all its elections and data. The action is recorded in the audit log.</Notice>}
      <PageHeader dark eyebrow="Platform" title="Colleges" description="Each college is an isolated tenant. Administrators only ever see colleges they're assigned to."
        actions={<ButtonLink href="/platform/colleges/new" variant="primary">Add college</ButtonLink>} />
      {rows.length === 0 ? <Empty dark title="No colleges yet" action={<ButtonLink href="/platform/colleges/new" variant="primary">Add the first college</ButtonLink>}>Create a college, then invite its election administrators.</Empty> : (
        <Table dark caption="Colleges">
          <thead><tr><th>College</th><th>Code</th><th>Admins</th><th>Elections</th><th>Retention</th><th>Status</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/platform/colleges/${c.id}`} className="font-medium hover:text-lime">{c.name}</Link>{c.city && <span className="block text-xs text-g500">{c.city}</span>}</td>
              <td className="font-mono text-g300">{c.code}</td><td className="tabular">{c.admins}</td>
              <td className="tabular">{c.elections}{c.live > 0 && <span className="text-lime"> · {c.live} live</span>}</td>
              <td className="tabular">{c.default_retention_days}d</td><td><Badge tone={c.status}>{c.status}</Badge></td>
            </tr>))}
          </tbody>
        </Table>
      )}
    </>
  );
}
