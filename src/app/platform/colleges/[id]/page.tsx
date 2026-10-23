import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { PageHeader, Card, Badge, Table, Notice, Stat, relTime, fmtDate } from "@/components/ui";
import { ActionForm, SubmitButton, Confirm } from "@/components/forms";
import { CollegeFields } from "@/components/college-form";
import { InviteAdminForm } from "@/components/invite-form";
import { isUuid } from "@/lib/action-utils";
import { effectiveStatus, STATUS_LABEL } from "@/lib/lifecycle";
import { updateCollegeAction, setCollegeStatusAction } from "../../actions";

export const metadata = { title: "College" };
export default async function College({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const { ctx } = await requireSuperAdmin();
  const cfg = await getConfig();
  const d = await withCtx(ctx, async (tx) => {
    const [c] = await tx`select *, (logo is not null) as has_logo from colleges where id = ${id}`;
    if (!c) return null;
    const admins = await tx`select u.id, u.name, u.email, u.status, u.last_login_at from college_admins ca join users u on u.id = ca.user_id where ca.college_id = ${id} order by u.name`;
    const elections = await tx`select e.id, e.title, e.status, e.starts_at, e.ends_at, e.public_ref,
                                 (select count(*)::int from voters v where v.election_id = e.id) as voters,
                                 (select count(distinct voter_id)::int from participations p where p.election_id = e.id) as participants
                               from elections e where e.college_id = ${id} order by e.starts_at desc`;
    const imports = await tx`select filename, status, accepted, rejected, created_at from voter_imports where college_id = ${id} order by created_at desc limit 5`;
    const activity = await tx`select at, actor_label, action, target from audit_events where college_id = ${id} order by id desc limit 10`;
    return { c, admins, elections, imports, activity };
  });
  if (!d) notFound();
  const { c } = d;
  return (
    <>
      {sp.created && <Notice tone="success" className="mb-5">College created. Invite its election administrators below.</Notice>}
      <PageHeader dark eyebrow={<Link href="/platform/colleges" className="hover:text-lime">← Colleges</Link>} title={c.name}
        description={<span className="font-mono">{c.code}</span>}
        actions={<>
          <Badge tone={c.status}>{c.status}</Badge>
          {c.status === "active"
            ? <Confirm triggerClass="inline-flex h-9 items-center rounded-full border border-g600 px-4 text-sm text-paper hover:border-[#ffd27a]" trigger="Suspend college" title="Suspend this college?" tone="danger" confirmLabel="Suspend"
                body={<p>Its administrators lose access immediately and its election links stop working. Data is preserved.</p>} action={setCollegeStatusAction} hidden={{ id, status: "suspended" }} reasonLabel="Reason (recorded in the audit log)" />
            : <Confirm triggerClass="inline-flex h-9 items-center rounded-full bg-lime px-4 text-sm font-medium text-ink" trigger="Reactivate" title="Reactivate this college?" confirmLabel="Reactivate" tone="primary"
                body={<p>Administrators regain access and election links work again.</p>} action={setCollegeStatusAction} hidden={{ id, status: "active" }} />}
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat dark label="Administrators" value={d.admins.length} />
        <Stat dark label="Elections" value={d.elections.length} />
        <Stat dark label="Voters on lists" value={d.elections.reduce((s, e) => s + e.voters, 0).toLocaleString("en-IN")} />
        <Stat dark label="Default retention" value={`${c.default_retention_days}d`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[var(--radius-card)] bg-paper p-5 text-ink sm:p-7">
          <h2 className="mb-5 text-lg font-semibold">College details</h2>
          <ActionForm action={updateCollegeAction}>
            <input type="hidden" name="id" value={id} />
            <CollegeFields c={c} retention={cfg.allowed_retention_days} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:items-end">
              <div className="space-y-1.5"><label htmlFor="logo" className="text-sm font-medium">College logo <span className="text-g500 font-normal">(PNG/JPEG/WebP, ≤300 KB)</span></label>
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-g100 file:px-4 file:py-2" /></div>
              {c.has_logo && <label className="flex items-center gap-2 text-sm"><img src={`/media/logo/${id}`} alt="" className="size-10 rounded-lg border border-g200 object-contain" /><input type="checkbox" name="remove_logo" className="accent-ink" /> Remove logo</label>}
            </div>
            <div className="mt-6"><SubmitButton pendingText="Saving…">Save changes</SubmitButton></div>
          </ActionForm>
        </div>
        <div className="space-y-6">
          <Card dark>
            <h2 className="mb-3 font-semibold">Administrators</h2>
            {d.admins.length === 0 ? <p className="text-sm text-g400">No administrators assigned yet.</p> : (
              <ul className="divide-y divide-g800">{d.admins.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/platform/admins/${a.id}`} className="min-w-0 hover:text-lime"><span className="block truncate font-medium">{a.name}</span><span className="block truncate text-xs text-g500">{a.email} · last login {relTime(a.last_login_at)}</span></Link>
                  <Badge tone={a.status}>{a.status}</Badge>
                </li>))}</ul>
            )}
          </Card>
          <div className="rounded-[var(--radius-card)] bg-paper p-5 text-ink">
            <h2 className="mb-4 font-semibold">Invite an administrator</h2>
            <InviteAdminForm colleges={[]} fixedCollegeId={id} />
          </div>
        </div>
      </div>

      <Card dark className="mt-6">
        <h2 className="mb-4 font-semibold">Elections</h2>
        {d.elections.length === 0 ? <p className="text-sm text-g400">No elections yet.</p> : (
          <Table dark caption="Elections at this college">
            <thead><tr><th>Election</th><th>Status</th><th>Voting window</th><th>Turnout</th></tr></thead>
            <tbody>{d.elections.map((e) => { const st = effectiveStatus(e as never); return (
              <tr key={e.id}><td>{e.title}<span className="block font-mono text-xs text-g500">{e.public_ref}</span></td><td><Badge tone={st}>{STATUS_LABEL[st]}</Badge></td>
                <td className="text-g300">{fmtDate(e.starts_at)} → {fmtDate(e.ends_at)}</td><td className="tabular">{e.participants}/{e.voters}</td></tr>); })}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card dark><h2 className="mb-3 font-semibold">Recent imports</h2>
          {d.imports.length === 0 ? <p className="text-sm text-g400">None.</p> : <ul className="divide-y divide-g800 text-sm">{d.imports.map((i, k) => <li key={k} className="flex justify-between gap-3 py-2"><span className="truncate">{i.filename}<span className="block text-xs text-g500">{relTime(i.created_at)}</span></span><span className="shrink-0 text-right"><Badge tone={i.status}>{i.status}</Badge><span className="block text-xs text-g500">{i.accepted} ok · {i.rejected} rejected</span></span></li>)}</ul>}
        </Card>
        <Card dark><h2 className="mb-3 font-semibold">Recent activity</h2>
          <ul className="divide-y divide-g800 text-sm">{d.activity.map((r, k) => <li key={k} className="py-2"><span className="font-mono text-[0.78rem] text-lime">{r.action}</span> <span className="text-g300">{r.target}</span><span className="block text-xs text-g500">{r.actor_label} · {relTime(r.at)}</span></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
