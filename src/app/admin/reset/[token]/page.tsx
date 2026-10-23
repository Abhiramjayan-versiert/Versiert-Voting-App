import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "@/components/set-password";
import { ButtonLink } from "@/components/ui";
import { peekToken } from "@/lib/admin-tokens";

export const metadata = { title: "Set a new password", referrer: "no-referrer" };
export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekToken(token, "password_reset");
  if (!t) return <AuthShell title="Link expired" subtitle="This reset link is invalid, used, or expired."><ButtonLink href="/admin/forgot">Request a new link</ButtonLink></AuthShell>;
  return <AuthShell title="Set a new password" subtitle={<>For <strong className="text-ink">{t.email}</strong></>}><SetPasswordForm token={token} purpose="password_reset" email={t.email} /></AuthShell>;
}
