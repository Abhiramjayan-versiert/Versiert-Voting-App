import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Notice } from "@/components/ui";
import { getAdminSession } from "@/lib/auth";
import { loginAction } from "../actions";

export const metadata = { title: "Administrator sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const s = await getAdminSession();
  if (s && s.mfaPassed) redirect(s.user.role === "super_admin" ? "/platform" : "/college");
  return (
    <AuthShell title="Sign in" subtitle="For college election administrators and the platform owner. Students don't need an account — use your election link.">
      {sp.signed_out && <Notice tone="info" className="mb-5">You have been signed out.</Notice>}
      {sp.welcome && <Notice tone="success" className="mb-5">Your account is ready. Sign in with your new password.</Notice>}
      {sp.reset && <Notice tone="success" className="mb-5">Password updated. Sign in with your new password.</Notice>}
      {sp.locked && <Notice tone="warning" className="mb-5">Too many incorrect codes. Sign in again.</Notice>}
      <ActionForm action={loginAction} className="space-y-5">
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required autoFocus /></Field>
        <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
        <SubmitButton variant="dark" className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/admin/forgot" className="text-g600 underline underline-offset-4 hover:text-ink">Forgot password?</Link>
        <Link href="/" className="text-g600 hover:text-ink">← Back to V.app</Link>
      </div>
    </AuthShell>
  );
}
