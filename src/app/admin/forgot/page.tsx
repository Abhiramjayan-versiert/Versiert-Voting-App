import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { forgotAction } from "../actions";

export const metadata = { title: "Reset password" };
export default function Forgot() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email a single-use link to college administrator accounts if email is set up. Otherwise ask your platform administrator to issue a reset link from the developer console.">
      <ActionForm action={forgotAction} className="space-y-5" resetOnSuccess>
        <Field label="Account email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <SubmitButton className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
      </ActionForm>
      <Link href="/admin/login" className="mt-6 inline-block text-sm text-g600 underline underline-offset-4 hover:text-ink">Back to sign in</Link>
    </AuthShell>
  );
}
