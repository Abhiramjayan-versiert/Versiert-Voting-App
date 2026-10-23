import { requireSuperAdmin } from "@/lib/auth";
import { getConfig, RETENTION_CHOICES } from "@/lib/config";
import { PageHeader, Field, Input, Select, Check, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { updateConfigAction } from "../actions";

export const metadata = { title: "Configuration" };
export default async function Config() {
  await requireSuperAdmin();
  const c = await getConfig();
  const num = (k: keyof typeof c, label: string, hint?: string) => (
    <Field label={label} htmlFor={k} hint={hint}><Input id={k} name={k} type="number" defaultValue={String(c[k])} required /></Field>
  );
  return (
    <>
      <PageHeader dark eyebrow="Settings" title="Platform configuration" description="Changes apply immediately and are recorded in the audit log." />
      <div className="rounded-[var(--radius-card)] bg-paper p-5 text-ink sm:p-8">
        <ActionForm action={updateConfigAction} className="space-y-10">
          <section>
            <h2 className="text-lg font-semibold">Maintenance mode</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Check name="maintenance_mode" label="Enable maintenance mode" description="Blocks voting and college dashboards. The developer console stays available." defaultChecked={c.maintenance_mode} />
              <Field label="Message shown to users" htmlFor="maintenance_message"><Textarea id="maintenance_message" name="maintenance_message" defaultValue={c.maintenance_message} rows={2} /></Field>
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Data retention</h2>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Retention periods colleges may choose (days after publication)</legend>
              <div className="mt-2 flex flex-wrap gap-2">{RETENTION_CHOICES.map((d) => (
                <label key={d} className="flex items-center gap-2 rounded-full border border-g300 px-3 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-lime"><input type="checkbox" name="allowed_retention_days" value={d} defaultChecked={c.allowed_retention_days.includes(d)} className="accent-ink" />{d}d</label>))}</div>
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Platform default" htmlFor="default_retention_days"><Select id="default_retention_days" name="default_retention_days" defaultValue={String(c.default_retention_days)}>{RETENTION_CHOICES.map((d) => <option key={d} value={d}>{d} days</option>)}</Select></Field>
              {num("pre_deletion_notice_days", "Pre-deletion notice (days)", "College admins are emailed this long before deletion.")}
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Authentication</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Check name="admin_mfa_required" label="Require two-step verification for college administrators" description="Always required for the Super Admin." defaultChecked={c.admin_mfa_required} />
              <div />
              {num("admin_session_hours", "Administrator session length (hours)")}
              {num("voter_session_minutes", "Voter session length (minutes)")}
              {num("otp_ttl_minutes", "Voter code lifetime (minutes)")}
              {num("otp_max_attempts", "Voter code attempts before lockout")}
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Rate limits & imports</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {num("rate_otp_per_ip_per_hour", "Voter code requests per network per hour", "Campus Wi-Fi shares one IP — keep this generous.")}
              {num("rate_login_per_ip_per_15min", "Admin sign-in attempts per network per 15 min")}
              {num("max_import_rows", "Maximum rows per voter import")}
              {num("max_import_mb", "Maximum import file size (MB)", "Hard ceiling 4 MB — Vercel's request body limit is 4.5 MB.")}
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Features & notifications</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Check name="email_notifications_enabled" label="Email notifications" description="Invitations, reminders and administrator alerts. One-time codes are always sent." defaultChecked={c.email_notifications_enabled} />
              <Check name="feature_candidate_photos" label="Candidate photographs" defaultChecked={c.feature_candidate_photos} />
              <Check name="feature_open_ballot" label="Allow open (non-secret) ballots" description="When off, every election is a secret ballot." defaultChecked={c.feature_open_ballot} />
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Backup status note</h2>
            <Field label="Shown on the health page" htmlFor="backup_status_note"><Textarea id="backup_status_note" name="backup_status_note" defaultValue={c.backup_status_note} rows={2} /></Field>
          </section>
          <SubmitButton pendingText="Saving…">Save configuration</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
