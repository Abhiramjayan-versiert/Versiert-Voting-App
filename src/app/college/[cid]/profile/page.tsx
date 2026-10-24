import { requireCollegeAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";

export const metadata = { title: "College profile" };
export default async function Profile({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { ctx } = await requireCollegeAdmin(cid);
  const [c] = await withCtx(ctx, (tx) => tx`select code, name, short_name, city, default_retention_days, status, (logo is not null) as has_logo from colleges where id = ${cid}`);
  const admins = await withCtx(ctx, (tx) => tx`select u.name, u.email, u.status from college_admins ca join users u on u.id = ca.user_id where ca.college_id = ${cid} order by u.name`);
  return (
    <>
      <PageHeader eyebrow="College" title={c.name} description="College details are managed by the platform administrator. Contact them to change the logo or retention defaults." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          {c.has_logo && <img src={`/media/logo/${cid}`} alt={`${c.name} logo`} className="mb-4 h-16 rounded-lg object-contain" />}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-g500">Code</dt><dd className="font-mono">{c.code}</dd>
            <dt className="text-g500">Short name</dt><dd>{c.short_name ?? "—"}</dd>
            <dt className="text-g500">City</dt><dd>{c.city ?? "—"}</dd>
            <dt className="text-g500">Default retention</dt><dd>{c.default_retention_days} days after publication</dd>
          </dl>
        </Card>
        <Card><h2 className="mb-3 font-semibold">Election administrators</h2><ul className="space-y-2 text-sm">{admins.map((a) => <li key={a.email}>{a.name} <span className="text-g500">· {a.email} · {a.status}</span></li>)}</ul></Card>
      </div>
    </>
  );
}
