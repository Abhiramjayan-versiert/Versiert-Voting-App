import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { Logo, Card, Field, Input, Badge, relTime, ButtonLink } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { changePasswordAction, revokeOtherSessionsAction, logoutAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account settings", robots: { index: false } };

export default async function Account() {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if ((s.user.role === "super_admin" || s.user.mfa_enabled) && !s.mfaPassed) redirect(s.user.mfa_enabled ? "/admin/mfa" : "/admin/mfa/setup");
  const sessions = await sql()`select id, created_at, last_seen_at, user_agent from sessions where user_id = ${s.user.id} and revoked_at is null and expires_at > now() order by last_seen_at desc`;
  const home = s.user.role === "super_admin" ? "/platform" : "/college";
  return (
    <div className="min-h-dvh bg-g50">
      <header className="border-b border-g200 bg-paper"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4"><Logo href={home} /><Link href={home} className="text-sm underline">Back to dashboard</Link></div></header>
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div><p className="eyebrow text-g500">Account</p><h1 className="mt-2 text-3xl font-semibold">{s.user.name}</h1><p className="text-g600">{s.user.email} · {s.user.role === "super_admin" ? "Developer / Super Admin" : "College election administrator"}</p></div>
        <Card>
          <h2 className="font-semibold">Two-step verification</h2>
          <p className="mt-1 text-sm text-g600">{s.user.mfa_enabled ? "On. An authenticator code is required at sign-in." : "Off. We strongly recommend turning it on."}</p>
          <ButtonLink href="/admin/mfa/setup" variant="outline" size="sm" className="mt-3">{s.user.mfa_enabled ? "Replace authenticator" : "Turn on"}</ButtonLink>
        </Card>
        <Card>
          <h2 className="font-semibold">Change password</h2>
          <ActionForm action={changePasswordAction} resetOnSuccess className="mt-4 space-y-4">
            <input type="hidden" name="username" value={s.user.email} autoComplete="username" />
            <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password" htmlFor="password" hint="12+ characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /></Field>
              <Field label="Confirm new password" htmlFor="password2"><Input id="password2" name="password2" type="password" autoComplete="new-password" minLength={12} required /></Field>
            </div>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Signed-in devices</h2><Badge tone="info">{sessions.length}</Badge></div>
          <ul className="mt-3 divide-y divide-g100 text-sm">{sessions.map((x) => (
            <li key={x.id} className="py-2.5"><span className="block truncate">{x.user_agent || "Unknown device"} {x.id === s.sessionId && <Badge tone="active">This device</Badge>}</span><span className="text-xs text-g500">Signed in {relTime(x.created_at)} · active {relTime(x.last_seen_at)}</span></li>))}</ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionForm action={revokeOtherSessionsAction}><SubmitButton variant="outline" size="sm">Sign out other devices</SubmitButton></ActionForm>
            <form action={logoutAction}><button className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper">Sign out</button></form>
          </div>
        </Card>
        {s.user.role === "super_admin" && <p className="text-xs text-g500">Lost your authenticator or password? Super Admin recovery is performed out-of-band by the platform owner with <code className="font-mono">npm run bootstrap:superadmin -- --email … --reset</code> against the database. See docs/OPERATIONS.md.</p>}
      </main>
    </div>
  );
}
