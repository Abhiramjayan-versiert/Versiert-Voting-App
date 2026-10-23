import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Notice } from "@/components/ui";
import { getAdminSession } from "@/lib/auth";
import { totpUri } from "@/lib/crypto";
import { sealPendingMfa } from "@/lib/admin-tokens";
import { mfaSetupAction } from "../../actions";

export const metadata = { title: "Set up two-step verification" };
export const dynamic = "force-dynamic";

export default async function MfaSetup() {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (s.user.mfa_enabled && !s.mfaPassed) redirect("/admin/mfa");
  const { secret, sealed } = sealPendingMfa(s.user.id);
  const svg = await QRCode.toString(totpUri(secret, s.user.email), { type: "svg", margin: 1, color: { dark: "#080808", light: "#ffffff" } });
  return (
    <AuthShell title="Set up two-step verification" subtitle={s.user.role === "super_admin" ? "Required for the developer console." : "Protect your administrator account with an authenticator app."}>
      {s.user.mfa_enabled && <Notice tone="warning" className="mb-5">Completing this replaces your current authenticator.</Notice>}
      <ol className="space-y-6 text-sm">
        <li>
          <p className="font-medium">1. Scan with Google Authenticator, 1Password, Authy or similar</p>
          <div className="mt-3 w-44 rounded-xl border border-g200 p-2" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-3 text-g600">Can't scan? Enter this key manually:</p>
          <p className="mt-1 select-all break-all rounded-lg bg-g50 px-3 py-2 font-mono text-[0.85rem] tracking-wider">{secret.match(/.{1,4}/g)?.join(" ")}</p>
        </li>
        <li>
          <p className="font-medium">2. Enter the 6-digit code it shows</p>
          <ActionForm action={mfaSetupAction} className="mt-3 space-y-4">
            <input type="hidden" name="pending" value={sealed} />
            <Field label="Authentication code" htmlFor="code">
              <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="font-mono text-lg tracking-[0.3em]" />
            </Field>
            <SubmitButton className="w-full" pendingText="Confirming…">Turn on two-step verification</SubmitButton>
          </ActionForm>
        </li>
      </ol>
    </AuthShell>
  );
}
