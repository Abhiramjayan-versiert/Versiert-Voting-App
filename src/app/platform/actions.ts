"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { withCtx, sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { run, str, bool, isUuid, readImage } from "@/lib/action-utils";
import { normalizeEmail } from "@/lib/email-normalize";
import { randomToken, sha256 } from "@/lib/crypto";
import { sendMailNow } from "@/lib/mailer";
import { env, isTestMode } from "@/lib/env";
import { ipHash } from "@/lib/request";
import { getConfig, setConfig, CONFIG_DEFAULTS } from "@/lib/config";
import { resolveIncident, UserError } from "@/lib/elections";
import { retentionRun, lifecycleTick, deliveryRun } from "@/lib/jobs";
import type { ActionState } from "@/components/forms";

async function actor() {
  const { s, ctx } = await requireSuperAdmin();
  return { s, ctx, a: { id: s.user.id, label: `super:${s.user.email}`, ipHash: await ipHash() } };
}

const collegeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,23}$/, "College code: 2–24 letters, digits or dashes."),
  name: z.string().trim().min(2, "College name is required.").max(160),
  short_name: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  default_retention_days: z.coerce.number().int(),
});

function parseCollege(fd: FormData) {
  return collegeSchema.parse({ code: str(fd, "code"), name: str(fd, "name"), short_name: str(fd, "short_name") || undefined, city: str(fd, "city") || undefined,
    default_retention_days: str(fd, "default_retention_days") || 30 });
}

export async function createCollegeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const { ctx, a } = await actor();
    const c = parseCollege(fd);
    const cfg = await getConfig();
    if (!cfg.allowed_retention_days.includes(c.default_retention_days)) throw new UserError("Choose a permitted retention period.");
    id = await withCtx(ctx, async (tx) => {
      const [dup] = await tx`select 1 from colleges where code = ${c.code}`;
      if (dup) throw new UserError("That college code is already in use.");
      const [r] = await tx`insert into colleges (code, name, short_name, city, default_retention_days)
                           values (${c.code}, ${c.name}, ${c.short_name ?? null}, ${c.city ?? null}, ${c.default_retention_days}) returning id`;
      await audit({ actorId: a.id, actorLabel: a.label, collegeId: r.id, action: "college.create", target: c.name, details: { code: c.code }, ipHash: a.ipHash }, tx);
      return r.id as string;
    });
  });
  if (id) redirect(`/platform/colleges/${id}?created=1`);
  return res;
}

export async function updateCollegeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, a } = await actor();
    const id = str(fd, "id"); if (!isUuid(id)) throw new UserError("Invalid college.");
    const c = parseCollege(fd);
    const cfg = await getConfig();
    if (!cfg.allowed_retention_days.includes(c.default_retention_days)) throw new UserError("Choose a permitted retention period.");
    const logo = await readImage(fd.get("logo"), 300);
    await withCtx(ctx, async (tx) => {
      const [dup] = await tx`select 1 from colleges where code = ${c.code} and id <> ${id}`;
      if (dup) throw new UserError("That college code is already in use.");
      await tx`update colleges set code = ${c.code}, name = ${c.name}, short_name = ${c.short_name ?? null}, city = ${c.city ?? null},
                 email_domains = '{}', default_retention_days = ${c.default_retention_days} where id = ${id}`;
      if (logo) await tx`update colleges set logo = ${logo.bytes}, logo_mime = ${logo.mime} where id = ${id}`;
      if (bool(fd, "remove_logo")) await tx`update colleges set logo = null, logo_mime = null where id = ${id}`;
      await audit({ actorId: a.id, actorLabel: a.label, collegeId: id, action: "college.update", target: c.name, ipHash: a.ipHash }, tx);
    });
    revalidatePath(`/platform/colleges/${id}`);
    return { ok: true, message: "College details saved." };
  });
}

export async function setCollegeStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, a } = await actor();
    const id = str(fd, "id"), status = str(fd, "status") === "suspended" ? "suspended" : "active";
    const reason = str(fd, "reason");
    if (status === "suspended" && reason.length < 10) throw new UserError("Give a reason of at least 10 characters.");
    await withCtx(ctx, async (tx) => {
      const [c] = await tx`update colleges set status = ${status} where id = ${id} returning name`;
      if (!c) throw new UserError("College not found.");
      await audit({ actorId: a.id, actorLabel: a.label, collegeId: id, action: status === "suspended" ? "college.suspend" : "college.reactivate", target: c.name, details: { reason }, ipHash: a.ipHash }, tx);
    });
    revalidatePath(`/platform/colleges/${id}`);
    return { ok: true, message: status === "suspended" ? "College suspended. Its administrators and election links are blocked." : "College reactivated." };
  });
}

async function issueToken(userId: string, purpose: "invite" | "password_reset", createdBy: string, hours: number) {
  const token = randomToken();
  await sql()`update auth_tokens set used_at = now() where user_id = ${userId} and purpose = ${purpose} and used_at is null`;
  await sql()`insert into auth_tokens (user_id, purpose, token_hash, expires_at, created_by)
              values (${userId}, ${purpose}, ${sha256(token)}, now() + make_interval(hours => ${hours}), ${createdBy})`;
  return token;
}

export async function inviteAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, a } = await actor();
    const email = normalizeEmail(str(fd, "email"));
    const name = str(fd, "name");
    const collegeIds = fd.getAll("college_ids").map(String).filter(isUuid);
    if (!email) throw new UserError("Enter a valid email address.");
    if (name.length < 2) throw new UserError("Enter the administrator's name.");
    if (!collegeIds.length) throw new UserError("Assign at least one college.");
    const result = await withCtx(ctx, async (tx) => {
      const [existing] = await tx`select id, role, status from users where email = ${email}`;
      if (existing && existing.role !== "college_admin") throw new UserError("That email belongs to a platform owner account.");
      if (existing && existing.status === "active") throw new UserError("That administrator already has an active account. Assign colleges from their profile instead.");
      const [u] = existing
        ? await tx`update users set name = ${name}, status = 'invited' where id = ${existing.id} returning id`
        : await tx`insert into users (email, name, role, status) values (${email}, ${name}, 'college_admin', 'invited') returning id`;
      for (const cid of collegeIds) {
        await tx`insert into college_admins (user_id, college_id, created_by) values (${u.id}, ${cid}, ${a.id}) on conflict do nothing`;
      }
      await audit({ actorId: a.id, actorLabel: a.label, collegeId: collegeIds[0], action: "admin.invite", target: email, details: { colleges: collegeIds }, ipHash: a.ipHash }, tx);
      return u.id as string;
    });
    const token = await issueToken(result, "invite", a.id, 72);
    const link = `${env().APP_URL}/invite/${token}`;
    const mail = await sendMailNow({ to: email, subject: "You're invited to administer elections on V.app",
      text: `Hello ${name},\n\nYou've been invited to manage elections on V.app.\n\nActivate your account (link valid for 72 hours, single use):\n${link}\n\nIf you weren't expecting this, you can ignore this email.\n\n— V.app · Your campus. Your choice.` });
    revalidatePath("/platform/admins");
    return { ok: true, message: mail.ok ? `Invitation sent to ${email}.` : `Invitation created but the email could not be sent (${mail.error}). Share the link securely instead.`,
      data: isTestMode() || !mail.ok ? { link } : undefined };
  });
}

export async function adminAccessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, a } = await actor();
    const userId = str(fd, "user_id"), op = str(fd, "op");
    if (!isUuid(userId)) throw new UserError("Invalid account.");
    const [u] = await sql()`select id, email, name, role, status from users where id = ${userId}`;
    if (!u || u.role !== "college_admin") throw new UserError("Administrator not found.");
    const reason = str(fd, "reason");
    let message = "Saved.";
    let data: unknown;
    await withCtx(ctx, async (tx) => {
      switch (op) {
        case "suspend": case "revoke": {
          if (reason.length < 10) throw new UserError("Give a reason of at least 10 characters.");
          await tx`update users set status = ${op === "suspend" ? "suspended" : "revoked"} where id = ${userId}`;
          await tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
          await tx`update auth_tokens set used_at = now() where user_id = ${userId} and used_at is null`;
          message = op === "suspend" ? "Access suspended and sessions signed out." : "Access revoked permanently and sessions signed out.";
          break;
        }
        case "reactivate": {
          if (u.status === "revoked") throw new UserError("Revoked accounts cannot be reactivated. Send a new invitation instead.");
          await tx`update users set status = case when password_hash is null then 'invited' else 'active' end, failed_logins = 0, locked_until = null where id = ${userId}`;
          message = "Access restored."; break;
        }
        case "sessions": {
          const r = await tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
          message = `${r.count} session(s) signed out.`; break;
        }
        case "reset_mfa": {
          await tx`update users set mfa_enabled = false, mfa_secret_enc = null, mfa_last_counter = null where id = ${userId}`;
          await tx`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
          message = "Two-step verification reset. They'll be asked to enrol again if required."; break;
        }
        case "assign": case "unassign": {
          const cid = str(fd, "college_id"); if (!isUuid(cid)) throw new UserError("Choose a college.");
          if (op === "assign") await tx`insert into college_admins (user_id, college_id, created_by) values (${userId}, ${cid}, ${a.id}) on conflict do nothing`;
          else await tx`delete from college_admins where user_id = ${userId} and college_id = ${cid}`;
          message = op === "assign" ? "College assigned." : "College unassigned."; break;
        }
        case "reset_link": case "resend_invite": break;
        default: throw new UserError("Unknown operation.");
      }
      await audit({ actorId: a.id, actorLabel: a.label, collegeId: str(fd, "college_id") || null, action: `admin.${op}`, target: u.email, details: reason ? { reason } : {}, ipHash: a.ipHash }, tx);
    });
    if (op === "reset_link" || op === "resend_invite") {
      if (u.status === "revoked" || u.status === "suspended") throw new UserError("Reactivate the account first.");
      const purpose = u.status === "invited" ? "invite" : "password_reset";
      const token = await issueToken(userId, purpose, a.id, purpose === "invite" ? 72 : 1);
      const link = `${env().APP_URL}/${purpose === "invite" ? "invite" : "admin/reset"}/${token}`;
      const mail = await sendMailNow({ to: u.email, subject: purpose === "invite" ? "Your V.app invitation" : "Reset your V.app password",
        text: `${purpose === "invite" ? "Activate your V.app administrator account" : "A platform administrator issued a password reset for your V.app account"}:\n${link}\n\nSingle use; expires in ${purpose === "invite" ? "72 hours" : "1 hour"}.` });
      message = mail.ok ? `${purpose === "invite" ? "Invitation" : "Reset link"} emailed to ${u.email}.` : "Link created, but email failed. Share it securely.";
      data = isTestMode() || !mail.ok ? { link } : undefined;
    }
    revalidatePath(`/platform/admins/${userId}`);
    return { ok: true, message, data };
  });
}

export async function updateConfigAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { a } = await actor();
    const allowed = fd.getAll("allowed_retention_days").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 3650).sort((x, y) => x - y);
    const num = (k: keyof typeof CONFIG_DEFAULTS, min: number, max: number) => {
      const n = Number(str(fd, k)); if (!Number.isFinite(n) || n < min || n > max) throw new UserError(`${k.replace(/_/g, " ")} must be between ${min} and ${max}.`); return Math.round(n);
    };
    const patch = {
      maintenance_mode: bool(fd, "maintenance_mode"),
      maintenance_message: str(fd, "maintenance_message").slice(0, 300) || CONFIG_DEFAULTS.maintenance_message,
      allowed_retention_days: allowed.length ? allowed : CONFIG_DEFAULTS.allowed_retention_days,
      default_retention_days: num("default_retention_days", 1, 3650),
      admin_mfa_required: bool(fd, "admin_mfa_required"),
      admin_session_hours: num("admin_session_hours", 1, 72),
      voter_session_minutes: num("voter_session_minutes", 5, 120),
      otp_max_attempts: num("otp_max_attempts", 3, 20),
      rate_otp_per_ip_per_hour: num("rate_otp_per_ip_per_hour", 5, 5000),
      rate_login_per_ip_per_15min: num("rate_login_per_ip_per_15min", 5, 500),
      max_import_rows: num("max_import_rows", 10, 100000),
      max_import_mb: num("max_import_mb", 1, 4),
      email_notifications_enabled: bool(fd, "email_notifications_enabled"),
      pre_deletion_notice_days: num("pre_deletion_notice_days", 0, 30),
      feature_candidate_photos: bool(fd, "feature_candidate_photos"),
      feature_open_ballot: bool(fd, "feature_open_ballot"),
      backup_status_note: str(fd, "backup_status_note").slice(0, 500),
    };
    if (!patch.allowed_retention_days.includes(patch.default_retention_days)) throw new UserError("The default retention period must be one of the permitted periods.");
    const before = await getConfig();
    await setConfig(patch, a.id);
    const changed = Object.keys(patch).filter((k) => JSON.stringify((before as never)[k]) !== JSON.stringify((patch as never)[k]));
    await audit({ actorId: a.id, actorLabel: a.label, action: "config.update", details: { changed }, ipHash: a.ipHash });
    revalidatePath("/platform/config");
    return { ok: true, message: changed.length ? `Saved: ${changed.join(", ")}.` : "No changes." };
  });
}

export async function resolveIncidentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, a } = await actor();
    await resolveIncident(ctx, a, str(fd, "id"), str(fd, "reason"));
    revalidatePath("/platform/security");
    return { ok: true, message: "Incident resolved." };
  });
}

export async function runJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { a } = await actor();
    const job = str(fd, "job");
    let out: unknown;
    if (job === "retention") out = await retentionRun();
    else if (job === "lifecycle") out = await lifecycleTick();
    else if (job === "notifications") out = await deliveryRun();
    else throw new UserError("Unknown job.");
    await audit({ actorId: a.id, actorLabel: a.label, action: `job.manual_run`, target: job, ipHash: a.ipHash });
    revalidatePath("/platform/jobs");
    return { ok: true, message: `Ran ${job}: ${JSON.stringify(out)}` };
  });
}

export async function retryCleanupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, a } = await actor();
    const id = str(fd, "election_id");
    await withCtx(ctx, (tx) => tx`update cleanup_jobs set status = 'scheduled', attempts = 0, last_error = null where election_id = ${id} and status = 'failed'`);
    const out = await retentionRun({ onlyElectionId: id });
    await audit({ actorId: a.id, actorLabel: a.label, electionId: id, action: "retention.retry", ipHash: a.ipHash });
    revalidatePath("/platform/jobs");
    return { ok: true, message: `Retry finished: ${out.purged} purged, ${out.failed} failed.` };
  });
}

/** Manual early deletion (developer only). Requires typed confirmation; election must have published results. */
export async function forceDeleteElectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, a } = await actor();
    const id = str(fd, "election_id");
    const [e] = await withCtx(ctx, (tx) => tx`select id, public_ref, status, college_id from elections where id = ${id}`);
    if (!e) throw new UserError("Election not found.");
    if (str(fd, "confirm_text") !== e.public_ref) throw new UserError("Confirmation text did not match.");
    if (!["published", "retention"].includes(e.status)) throw new UserError("Only elections with published results can be deleted early.");
    const reason = str(fd, "reason");
    if (reason.length < 10) throw new UserError("Give a reason of at least 10 characters.");
    await audit({ actorId: a.id, actorLabel: a.label, collegeId: e.college_id, electionId: id, action: "retention.manual_delete_requested", details: { reason }, ipHash: a.ipHash });
    const out = await retentionRun({ onlyElectionId: id, force: true });
    revalidatePath("/platform/jobs");
    if (out.failed) throw new UserError("Deletion did not complete. See the cleanup monitor for details.");
    return { ok: true, message: "Election data deleted. A deletion receipt was recorded." };
  });
}

export async function revokeAllMySessionsAction(_: ActionState, __?: FormData): Promise<ActionState> {
  return run(async () => {
    const { s, a } = await actor();
    await sql()`update sessions set revoked_at = now() where user_id = ${s.user.id} and revoked_at is null`;
    await audit({ actorId: a.id, actorLabel: a.label, action: "auth.revoke_all_sessions", ipHash: a.ipHash });
    redirect("/admin/login?signed_out=1");
  });
}
