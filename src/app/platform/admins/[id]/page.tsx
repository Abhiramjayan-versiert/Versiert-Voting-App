import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { isUuid } from "@/lib/action-utils";
import { PageHeader, Card, Badge, relTime, fmtDate, Select } from "@/components/ui";
import { ActionForm, Confirm, SubmitButton } from "@/components/forms";
import { adminAccessAction } from "../../actions";

export const metadata = { title: "Administrator" };
const pill = "inline-flex h-9 items-center rounded-full border border-g600 px-4 text-sm text-paper hover:border-lime";

export default async function Admin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { ctx } = await requireSuperAdmin();
  const d = await withCtx(ctx, async (tx) => {
    const [u] = await tx`select id, name, email, status, role, mfa_enabled, last_login_at, created_at, locked_until from users where id = ${id} and role = 'college_admin'`;
    if (!u) return null;
    return {
      u,
      assigned: await tx`select c.id, c.name from college_admins ca join colleges c on c.id = ca.college_id where ca.user_id = ${id} order by c.name`,
      all: await tx`select id, name from colleges where status = 'active' order by name`,
      sessions: await tx`select created_at, last_seen_at, user_agent, mfa_passed from sessions where user_id = ${id} and revoked_at is null and expires_at > now() order by last_seen_at desc`,
      activity: await tx`select at, action, target from audit_events where actor_id = ${id} order by id desc limit 12`,
    };
  });
  if (!d) notFound();
  const { u } = d;
  const unassigned = d.all.filter((c) => !d.assigned.some((a) => a.id === c.id));
  return (
    <>
      <PageHeader dark eyebrow={<Link href="/platform/admins" className="hover:text-lime">← Administrators</Link>} title={u.name} description={u.email}
        actions={<Badge tone={u.status}>{u.status}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card dark>
          <h2 className="mb-3 font-semibold">Account</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-g500">Created</dt><dd>{fmtDate(u.created_at)}</dd>
            <dt className="text-g500">Last login</dt><dd>{relTime(u.last_login_at)}</dd>
            <dt className="text-g500">Two-step verification</dt><dd>{u.mfa_enabled ? "Enrolled" : "Not enrolled"}</dd>
            <dt className="text-g500">Lockout</dt><dd>{u.locked_until && new Date(u.locked_until) > new Date() ? `Locked until ${fmtDate(u.locked_until)}` : "None"}</dd>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {(u.status === "active" || u.status === "invited") && <>
              <Confirm triggerClass={pill} trigger="Suspend access" title="Suspend this administrator?" tone="danger" confirmLabel="Suspend" body={<p>They are signed out everywhere and cannot sign in until reactivated.</p>} action={adminAccessAction} hidden={{ user_id: id, op: "suspend" }} reasonLabel="Reason" />
              <Confirm triggerClass={pill} trigger="Revoke permanently" title="Revoke access permanently?" tone="danger" confirmLabel="Revoke" body={<p>This cannot be undone. A new invitation would be required.</p>} action={adminAccessAction} hidden={{ user_id: id, op: "revoke" }} reasonLabel="Reason" requireText="REVOKE" />
            </>}
            {u.status === "suspended" && <Confirm triggerClass={pill} trigger="Reactivate" title="Reactivate this administrator?" confirmLabel="Reactivate" tone="primary" body={<p>They can sign in again.</p>} action={adminAccessAction} hidden={{ user_id: id, op: "reactivate" }} />}
            {u.status !== "revoked" && u.status !== "suspended" && <Confirm triggerClass={pill} trigger={u.status === "invited" ? "Resend invitation" : "Issue password reset"} title={u.status === "invited" ? "Send a new invitation?" : "Issue a reset link?"} confirmLabel="Send" body={<p>Any previous link stops working. The new link is single-use.</p>} action={adminAccessAction} hidden={{ user_id: id, op: u.status === "invited" ? "resend_invite" : "reset_link" }} />}
            <Confirm triggerClass={pill} trigger="Sign out all sessions" title="Sign out all sessions?" confirmLabel="Sign out" body={<p>Every active session for this account ends now.</p>} action={adminAccessAction} hidden={{ user_id: id, op: "sessions" }} />
            {u.mfa_enabled && <Confirm triggerClass={pill} trigger="Reset two-step verification" title="Reset two-step verification?" tone="danger" confirmLabel="Reset" body={<p>Use only after confirming their identity out-of-band (lost device).</p>} action={adminAccessAction} hidden={{ user_id: id, op: "reset_mfa" }} reasonLabel="How was their identity confirmed?" />}
          </div>
        </Card>
        <Card dark>
          <h2 className="mb-3 font-semibold">College assignments</h2>
          <ul className="divide-y divide-g800">{d.assigned.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5 text-sm"><span>{c.name}</span>
              <Confirm triggerClass="text-xs text-g400 underline hover:text-lime" trigger="Unassign" title={`Unassign ${c.name}?`} confirmLabel="Unassign" body={<p>They immediately lose access to this college's elections.</p>} action={adminAccessAction} hidden={{ user_id: id, op: "unassign", college_id: c.id }} />
            </li>))}
            {d.assigned.length === 0 && <li className="py-2 text-sm text-g400">No colleges assigned.</li>}
          </ul>
          {unassigned.length > 0 && (
            <div className="mt-4 rounded-xl bg-paper p-4 text-ink">
              <ActionForm action={adminAccessAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="user_id" value={id} /><input type="hidden" name="op" value="assign" />
                <div className="flex-1"><label className="text-sm font-medium" htmlFor="college_id">Assign another college</label>
                  <Select id="college_id" name="college_id" className="mt-1.5">{unassigned.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
                <SubmitButton size="md">Assign</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>
        <Card dark>
          <h2 className="mb-3 font-semibold">Active sessions</h2>
          {d.sessions.length === 0 ? <p className="text-sm text-g400">None.</p> : <ul className="divide-y divide-g800 text-sm">{d.sessions.map((s, i) => <li key={i} className="py-2"><span className="block truncate text-g300">{s.user_agent || "Unknown device"}</span><span className="text-xs text-g500">Started {relTime(s.created_at)} · active {relTime(s.last_seen_at)} · {s.mfa_passed ? "MFA verified" : "password only"}</span></li>)}</ul>}
        </Card>
        <Card dark>
          <h2 className="mb-3 font-semibold">Recent actions</h2>
          {d.activity.length === 0 ? <p className="text-sm text-g400">None.</p> : <ul className="divide-y divide-g800 text-sm">{d.activity.map((r, i) => <li key={i} className="py-2"><span className="font-mono text-[0.78rem] text-lime">{r.action}</span> <span className="text-g300">{r.target}</span><span className="block text-xs text-g500">{relTime(r.at)}</span></li>)}</ul>}
        </Card>
      </div>
    </>
  );
}
