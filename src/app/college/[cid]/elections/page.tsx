import Link from "next/link";
import { requireCollegeAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { electionsWithStats } from "@/lib/college-data";
import { PageHeader, Table, Badge, ButtonLink, Empty, Notice, fmtDate } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/lifecycle";

export const metadata = { title: "Elections" };
export default async function Elections({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { cid } = await params; const sp = await searchParams;
  const { ctx } = await requireCollegeAdmin(cid);
  const els = await withCtx(ctx, (tx) => electionsWithStats(tx, cid));
  return (
    <>
      {sp.deleted && <Notice tone="success" className="mb-5">Draft deleted.</Notice>}
      <PageHeader eyebrow="Elections" title="All elections" actions={<ButtonLink href={`/college/${cid}/elections/new`} variant="primary">New election</ButtonLink>} />
      {els.length === 0 ? <Empty title="No elections yet" action={<ButtonLink href={`/college/${cid}/elections/new`} variant="primary">Create an election</ButtonLink>} /> : (<>
        <ul className="space-y-3 md:hidden">{els.map((e) => (
          <li key={e.id}><Link href={`/college/${cid}/elections/${e.id}`} className="block rounded-[var(--radius-card)] border border-g200 p-4 hover:border-ink">
            <div className="flex items-start justify-between gap-3"><span className="font-medium">{e.title}</span><Badge tone={e.effective}>{STATUS_LABEL[e.effective as keyof typeof STATUS_LABEL]}</Badge></div>
            <p className="mt-1 text-xs text-g500">{fmtDate(e.starts_at, e.timezone)} → {fmtDate(e.ends_at, e.timezone)}</p>
            <p className="mt-2 text-sm text-g600">{e.positions} position{e.positions === 1 ? "" : "s"} · {e.candidates} candidate{e.candidates === 1 ? "" : "s"} · turnout {e.participants}/{e.voters}</p>
          </Link></li>))}
        </ul>
        <div className="hidden md:block"><Table caption="Elections">
          <thead><tr><th>Election</th><th>Status</th><th>Voting window</th><th>Setup</th><th>Turnout</th></tr></thead>
          <tbody>{els.map((e) => (
            <tr key={e.id}>
              <td><Link href={`/college/${cid}/elections/${e.id}`} className="font-medium hover:underline">{e.title}</Link><span className="block text-xs text-g500">{e.event_name}</span></td>
              <td><Badge tone={e.effective}>{STATUS_LABEL[e.effective as keyof typeof STATUS_LABEL]}</Badge>{e.flags > 0 && <Badge tone="warning" className="ml-1">{e.flags} flag</Badge>}</td>
              <td className="text-xs text-g600">{fmtDate(e.starts_at, e.timezone)}<br />{fmtDate(e.ends_at, e.timezone)}</td>
              <td className="text-xs text-g600">{e.positions} positions · {e.candidates} candidates</td>
              <td className="tabular">{e.participants}/{e.voters}</td>
            </tr>))}
          </tbody>
        </Table></div>
      </>)}
    </>
  );
}
