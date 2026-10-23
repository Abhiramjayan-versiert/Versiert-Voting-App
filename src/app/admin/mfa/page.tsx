import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { getAdminSession } from "@/lib/auth";
import { mfaVerifyAction, logoutAction } from "../actions";

export const metadata = { title: "Two-step verification" };

export default async function Mfa() {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (!s.user.mfa_enabled) redirect("/admin/mfa/setup");
  if (s.mfaPassed) redirect(s.user.role === "super_admin" ? "/platform" : "/college");
  return (
    <AuthShell title="Two-step verification" subtitle={<>Enter the 6-digit code from your authenticator app for <strong className="text-ink">{s.user.email}</strong>.</>}>
      <ActionForm action={mfaVerifyAction} className="space-y-5">
        <Field label="Authentication code" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="font-mono text-lg tracking-[0.3em]" />
        </Field>
        <SubmitButton className="w-full" pendingText="Verifying…">Verify</SubmitButton>
      </ActionForm>
      <form action={logoutAction} className="mt-6"><button className="text-sm text-g600 underline underline-offset-4 hover:text-ink">Use a different account</button></form>
    </AuthShell>
  );
}
