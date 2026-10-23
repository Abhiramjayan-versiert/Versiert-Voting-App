import "server-only";
import { sql } from "./db";

export const RETENTION_CHOICES = [1, 7, 14, 30, 60, 90, 180, 365] as const;

export const CONFIG_DEFAULTS = {
  maintenance_mode: false,
  maintenance_message: "V.app is undergoing scheduled maintenance. Please try again shortly.",
  default_retention_days: 30,
  allowed_retention_days: [1, 7, 14, 30, 60, 90, 180, 365] as number[],
  admin_mfa_required: false,
  admin_session_hours: 12,
  voter_session_minutes: 30,
  otp_ttl_minutes: 10,
  otp_max_attempts: 5,
  rate_otp_per_ip_per_hour: 30,
  rate_login_per_ip_per_15min: 20,
  max_import_rows: 20000,
  max_import_mb: 5,
  email_notifications_enabled: true,
  pre_deletion_notice_days: 3,
  feature_candidate_photos: true,
  feature_open_ballot: true,
  backup_status_note: "Managed by the database provider. See docs/OPERATIONS.md.",
};
export type PlatformConfig = typeof CONFIG_DEFAULTS;

export async function getConfig(): Promise<PlatformConfig> {
  const rows = await sql()`select key, value from system_config`;
  const merged: Record<string, unknown> = { ...CONFIG_DEFAULTS };
  for (const r of rows) if (r.key in CONFIG_DEFAULTS) merged[r.key as string] = r.value;
  return merged as PlatformConfig;
}

export async function setConfig(patch: Partial<PlatformConfig>, userId: string) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in CONFIG_DEFAULTS)) continue;
    await sql()`insert into system_config (key, value, updated_by) values (${k}, ${sql().json(v as never)}, ${userId})
                on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
  }
}
