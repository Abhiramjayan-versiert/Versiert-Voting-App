import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Table, fmtDate, Card, Badge, Input, Select } from "@/components/ui";

export const metadata = { title: "Audit log" };
export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { ctx } = await requireSuperAdmin();
  const q = (sp.q ?? "").slice(0, 80), college = sp.college ?? "", before = Number(sp.before) || null;
  const d = await withCtx(ctx, async (tx) => {
    const [chain] = await tx`select * from app.verify_audit_chain()`;
    const colleges = await tx`select id, name from colleges order by name`;
    const rows = await tx`
      select a.*, c.name as college from audit_events a left join colleges c on c.id = a.college_id
       where (${q} = '' or a.action ilike ${"%" + q + "%"} or a.actor_label ilike ${"%" + q + "%"} or a.target ilike ${"%" + q + "%"})
         and (${college} = '' or a.college_id::text = ${college})
         and (${before}::bigint is null or a.id < ${before})
       order by a.id desc limit 100`;
    return { chain, colleges, rows };
  });
  const last = d.rows.at(-1)?.id;
  return (
    <>
      <PageHeader dark eyebrow="Oversight" title="Audit log" description="Append-only and hash-chained: each entry includes the hash of the one before it, and the database rejects edits and deletions." />
      <Card dark className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={d.chain.ok ? "completed" : "critical"}>{d.chain.ok ? "Chain verified" : "Chain broken"}</Badge>
        <span className="text-sm text-g300">{d.chain.ok ? `${Number(d.chain.checked).toLocaleString("en-IN")} entries recomputed and matched just now.` : `Mismatch at entry #${d.chain.first_bad_id}. Treat as a security incident.`}</span>
      </Card>
      <form className="mb-5 flex flex-col gap-3 rounded-[var(--radius-card)] bg-paper p-4 text-ink sm:flex-row sm:items-end">
        <div className="flex-1"><label htmlFor="q" className="text-sm font-medium">Search action, actor or target</label><Input id="q" name="q" defaultValue={q} className="mt-1.5" /></div>
        <div className="sm:w-64"><label htmlFor="college" className="text-sm font-medium">College</label>
          <Select id="college" name="college" defaultValue={college} className="mt-1.5"><option value="">All</option>{d.colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <button className="h-11 rounded-full bg-ink px-5 text-sm font-medium text-paper">Filter</button>
      </form>
      <Table dark caption="Audit entries">
        <thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>College</th><th>Details</th><th>Hash</th></tr></thead>
        <tbody>{d.rows.map((r) => (
          <tr key={r.id}><td className="font-mono text-xs text-g500">{r.id}</td><td className="whitespace-nowrap text-xs text-g300">{fmtDate(r.at)}</td><td className="text-xs">{r.actor_label}</td>
            <td className="font-mono text-[0.78rem] text-lime">{r.action}</td><td className="text-g300">{r.target}</td><td className="text-xs text-g400">{r.college}</td>
            <td className="max-w-xs break-words font-mono text-[0.7rem] text-g400">{JSON.stringify(r.details) === "{}" ? "" : JSON.stringify(r.details)}</td>
            <td className="font-mono text-[0.7rem] text-g500" title={r.hash}>{r.hash.slice(0, 10)}…</td></tr>))}
        </tbody>
      </Table>
      {d.rows.length === 100 && last && <a href={`?q=${encodeURIComponent(q)}&college=${college}&before=${last}`} className="mt-4 inline-block text-sm text-lime underline">Older entries →</a>}
    </>
  );
}
