import { requireSuperAdmin } from "@/lib/auth";
import { sql, withCtx } from "@/lib/db";
import { env } from "@/lib/env";
import { getConfig } from "@/lib/config";
import { PageHeader, Card, Badge, Table, relTime } from "@/components/ui";

export const metadata = { title: "Health & backups" };
export default async function Health() {
  const { ctx } = await requireSuperAdmin();
  const t0 = performance.now();
  await sql()`select 1`;
  const latency = Math.round(performance.now() - t0);
  const cfg = await getConfig();
  const d = await withCtx(ctx, async (tx) => ({
    v: (await tx`select version() as v, current_setting('server_version') as sv, now() as now`)[0],
    migrations: await tx`select count(*)::int as n, max(applied_at) as last from schema_migrations`.catch(() => [{ n: "?", last: null }]),
    sizes: await tx`select relname as t, pg_total_relation_size(c.oid)::bigint as bytes, n_live_tup::bigint as rows
                     from pg_class c join pg_stat_user_tables s on s.relid = c.oid order by pg_total_relation_size(c.oid) desc limit 12`,
    jobs: await tx`select distinct on (job) job, status, started_at from job_runs order by job, started_at desc`,
  }));
  const e = env();
  const checks = [
    { n: "Database reachable", ok: true, d: `${latency} ms round trip · PostgreSQL ${d.v.sv}` },
    { n: "Runtime mode", ok: e.APP_MODE === "production", d: e.APP_MODE === "test" ? "TEST MODE — fictional data, dev mailbox enabled" : "Production" },
    { n: "HTTPS application URL", ok: e.APP_URL.startsWith("https://"), d: e.APP_URL },
    { n: "Email provider (optional)", ok: true, d: e.RESEND_API_KEY ? `Resend · from ${e.EMAIL_FROM}` : "Not configured — invitation and reset links are shown on screen; voters verify with email + student ID" },
    { n: "Bot challenge (Turnstile)", ok: !!e.TURNSTILE_SECRET_KEY, d: e.TURNSTILE_SECRET_KEY ? "Configured — shown on suspicious volume" : "Optional — not configured; rate limits still apply" },
    { n: "Lifecycle cron ran in the last 15 min", ok: d.jobs.some((j) => j.job === "lifecycle" && Date.now() - new Date(j.started_at).getTime() < 15 * 60_000), d: relTime(d.jobs.find((j) => j.job === "lifecycle")?.started_at) },
    { n: "Retention cron ran in the last 26 h", ok: d.jobs.some((j) => j.job === "retention" && Date.now() - new Date(j.started_at).getTime() < 26 * 3600_000), d: relTime(d.jobs.find((j) => j.job === "retention")?.started_at) },
  ];
  return (
    <>
      <PageHeader dark eyebrow="Oversight" title="Health & backups" />
      <Table dark caption="Health checks">
        <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody>{checks.map((c) => <tr key={c.n}><td>{c.n}</td><td><Badge tone={c.ok ? "completed" : "warning"}>{c.ok ? "OK" : "Attention"}</Badge></td><td className="text-g300">{c.d}</td></tr>)}</tbody>
      </Table>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card dark>
          <h2 className="mb-3 font-semibold">Backup & recovery status</h2>
          <p className="text-sm text-g300">{cfg.backup_status_note}</p>
          <ul className="mt-4 space-y-2 text-sm text-g300 list-disc pl-5">
            <li>Backups are taken by the managed database provider (e.g. Supabase daily backups / PITR, Neon branching history). V.app cannot list them.</li>
            <li>Target RPO ≤ 24 h (daily) or ≤ minutes with PITR; target RTO ≤ 4 h. See <span className="font-mono">docs/OPERATIONS.md</span>.</li>
            <li>Deleted election data persists in provider backups until those backups expire. Deletion receipts record the in-database deletion only.</li>
          </ul>
          <p className="mt-4 text-xs text-g500">Schema migrations applied: {d.migrations[0].n} · last {relTime(d.migrations[0].last)}</p>
        </Card>
        <Card dark>
          <h2 className="mb-3 font-semibold">Storage by table</h2>
          <ul className="divide-y divide-g800 text-sm">{d.sizes.map((s) => (
            <li key={s.t} className="flex justify-between py-1.5"><span className="font-mono text-g300">{s.t}</span><span className="tabular text-g400">{Number(s.rows).toLocaleString("en-IN")} rows · {(Number(s.bytes) / 1024).toFixed(0)} KB</span></li>))}</ul>
        </Card>
      </div>
    </>
  );
}
