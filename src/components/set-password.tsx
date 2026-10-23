import { ActionForm, SubmitButton } from "./forms";
import { Field, Input } from "./ui";
import { setPasswordAction } from "@/app/admin/actions";

export function SetPasswordForm({ token, purpose, name, email }: { token: string; purpose: "invite" | "password_reset"; name?: string; email: string }) {
  return (
    <ActionForm action={setPasswordAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="username" value={email} autoComplete="username" />
      {purpose === "invite" && <Field label="Your name" htmlFor="name"><Input id="name" name="name" defaultValue={name} maxLength={120} required /></Field>}
      <Field label="New password" htmlFor="password" hint="At least 12 characters, mixing letters with numbers or symbols.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label="Confirm password" htmlFor="password2"><Input id="password2" name="password2" type="password" autoComplete="new-password" minLength={12} required /></Field>
      <SubmitButton className="w-full" pendingText="Saving…">{purpose === "invite" ? "Activate account" : "Set new password"}</SubmitButton>
    </ActionForm>
  );
}
