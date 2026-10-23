import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "@/components/set-password";
import { peekToken } from "@/lib/admin-tokens";

export const metadata = { title: "Accept invitation", referrer: "no-referrer" };
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekToken(token, "invite");
  if (!t) return <AuthShell eyebrow="Invitation" title="Invitation unavailable" subtitle="This invitation is invalid, already used, or expired. Ask the platform administrator to send a new one." >{null}</AuthShell>;
  return (
    <AuthShell eyebrow="Invitation" title="Welcome to V.app" subtitle={<>You've been invited as a college election administrator. Set a password for <strong className="text-ink">{t.email}</strong>.</>}>
      <SetPasswordForm token={token} purpose="invite" name={t.name} email={t.email} />
    </AuthShell>
  );
}
