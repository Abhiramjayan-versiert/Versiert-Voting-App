"use server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import {
  createAdminSession, destroyAdminSession, getAdminSession, hashPassword, passwordProblems, verifyPassword, checkTotp,
} from "@/lib/auth";
import { encrypt, decrypt, randomToken, sha256 } from "@/lib/crypto";
import { consumeToken } from "@/lib/admin-tokens";
import { normalizeEmail } from "@/lib/email-normalize";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash as getIpHash, userAgent } from "@/lib/request";
import { audit, securityEvent } from "@/lib/audit";
import { queueNotification, sendMailNow } from "@/lib/mailer";
import { getConfig } from "@/lib/config";
import { run, str } from "@/lib/action-utils";
import type { ActionState } from "@/components/forms";

const GENERIC_LOGIN = "Email or password is incorrect.";
// Pre-computed hash used to keep timing uniform for unknown accounts.
let dummyHash: string | null = null;

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "";
  const res = await run(async () => {
    const email = normalizeEmail(str(fd, "email"));
    const password = String(fd.get("password") ?? "");
    const ip = await getIpHash();
    const cfg = await getConfig();
    if (!(await rateLimit(`login-ip:${ip}`, cfg.rate_login_per_ip_per_15min, 900)).ok) {
      await securityEvent({ kind: "login_rate_limited", severity: "warning", ipHash: ip });
      return { error: "Too many sign-in attempts. Please wait 15 minutes." };
    }
    if (!email || !password || password.length > 200) return { error: GENERIC_LOGIN };
    if (!(await rateLimit(`login-email:${sha256(email)}`, 10, 900)).ok) return { error: "Too many sign-in attempts. Please wait 15 minutes." };

    const [u] = await sql()`select * from users where email = ${email}`;
    if (!u || !u.password_hash) {
      dummyHash ??= await hashPassword("timing-equaliser-not-a-real-password");
      await verifyPassword(dummyHash, password);
      return { error: GENERIC_LOGIN };
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) return { error: "This account is temporarily locked after repeated failed attempts. Try again later." };
    const ok = await verifyPassword(u.password_hash, password);
    if (!ok || u.status !== "active") {
      const [r] = await sql()`update users set failed_logins = failed_logins + 1,
                                 locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else locked_until end
                               where id = ${u.id} returning failed_logins`;
      if (r.failed_logins >= 5) await securityEvent({ kind: "account_locked", severity: "warning", ipHash: ip, details: { user_id: u.id } });
      return { error: GENERIC_LOGIN };
    }
    await sql()`update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = ${u.id}`;
    await createAdminSession(u.id, false, ip, await userAgent());
    await audit({ actorId: u.id, actorLabel: u.email, action: "auth.login_password_ok", ipHash: ip });
    if (u.role === "super_admin") {
      await securityEvent({ kind: "super_admin_login", severity: "info", ipHash: ip });
      await queueNotification({ to: u.email, kind: "login_alert", subject: "New sign-in to the V.app developer console",
        text: `A sign-in to your V.app Super Admin account started at ${new Date().toUTCString()} (UA: ${(await userAgent()).slice(0, 80)}).\n\nIf this wasn't you, revoke all sessions from the console and rotate your password and MFA using the recovery procedure.` });
    }
    const needsMfa = u.role === "super_admin" || cfg.admin_mfa_required || u.mfa_enabled;
    dest = needsMfa ? (u.mfa_enabled ? "/admin/mfa" : "/admin/mfa/setup") : u.role === "super_admin" ? "/platform" : "/college";
  });
  if (dest) redirect(dest);
  return res;
}

export async function mfaVerifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "";
  const res = await run(async () => {
    const s = await getAdminSession();
    if (!s) { dest = "/admin/login"; return; }
    const ip = await getIpHash();
    if (!(await rateLimit(`mfa:${s.sessionId}`, 6, 900)).ok) {
      await sql()`update sessions set revoked_at = now() where id = ${s.sessionId}`;
      await securityEvent({ kind: "mfa_attempts_exhausted", severity: "warning", ipHash: ip, details: { user_id: s.user.id } });
      dest = "/admin/login?locked=1"; return;
    }
    if (!(await checkTotp(s.user, str(fd, "code")))) return { error: "That code didn't match. Use the current 6-digit code from your authenticator app." };
    await sql()`update sessions set mfa_passed = true where id = ${s.sessionId}`;
    await audit({ actorId: s.user.id, actorLabel: s.user.email, action: "auth.mfa_ok", ipHash: ip });
    dest = s.user.role === "super_admin" ? "/platform" : "/college";
  });
  if (dest) redirect(dest);
  return res;
}

export async function mfaSetupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "";
  const res = await run(async () => {
    const s = await getAdminSession();
    if (!s) { dest = "/admin/login"; return; }
    if (s.user.mfa_enabled && !s.mfaPassed) { dest = "/admin/mfa"; return; }
    let secret = "";
    try {
      const p = JSON.parse(decrypt(str(fd, "pending"), env().ENCRYPTION_KEY)) as { secret: string; uid: string; exp: number };
      if (p.uid !== s.user.id || p.exp < Date.now()) throw new Error("expired");
      secret = p.secret;
    } catch { return { error: "Setup expired. Reload the page to get a new key." }; }
    if (!(await checkTotp(s.user, str(fd, "code"), secret))) return { error: "That code didn't match. Check your device's clock and try the current code." };
    await sql()`update users set mfa_secret_enc = ${encrypt(secret, env().ENCRYPTION_KEY)}, mfa_enabled = true where id = ${s.user.id}`;
    await sql()`update sessions set revoked_at = now() where user_id = ${s.user.id} and id <> ${s.sessionId} and revoked_at is null`;
    await sql()`update sessions set mfa_passed = true where id = ${s.sessionId}`;
    await audit({ actorId: s.user.id, actorLabel: s.user.email, action: "auth.mfa_enrolled", ipHash: await getIpHash() });
    dest = s.user.role === "super_admin" ? "/platform" : "/college";
  });
  if (dest) redirect(dest);
  return res;
}

export async function logoutAction() {
  const s = await getAdminSession();
  if (s) await audit({ actorId: s.user.id, actorLabel: s.user.email, action: "auth.logout", ipHash: await getIpHash() });
  await destroyAdminSession();
  redirect("/admin/login?signed_out=1");
}

export async function forgotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const generic = { ok: true, message: "If an administrator account exists for that address, a reset link has been sent. It expires in 30 minutes." };
    const email = normalizeEmail(str(fd, "email"));
    const ip = await getIpHash();
    if (!(await rateLimit(`forgot-ip:${ip}`, 5, 3600)).ok) return generic;
    if (!email) return generic;
    const [u] = await sql()`select id, email, role, status from users where email = ${email}`;
    // Super Admin recovery is deliberately out-of-band (owner script), never via email.
    if (!u || u.role !== "college_admin" || u.status !== "active") return generic;
    const token = randomToken();
    await sql()`insert into auth_tokens (user_id, purpose, token_hash, expires_at) values (${u.id}, 'password_reset', ${sha256(token)}, now() + interval '30 minutes')`;
    await sendMailNow({ to: u.email, subject: "Reset your V.app password", text: `A password reset was requested for your V.app administrator account.\n\nReset link (valid 30 minutes, single use):\n${env().APP_URL}/admin/reset/${token}\n\nIf you didn't request this, ignore this email — your password is unchanged.` });
    await audit({ actorId: u.id, actorLabel: u.email, action: "auth.password_reset_requested", ipHash: ip });
    return generic;
  });
}

export async function setPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "";
  const res = await run(async () => {
    const token = str(fd, "token"), purpose = str(fd, "purpose") === "invite" ? "invite" : "password_reset";
    const t = await consumeToken(token, purpose);
    if (!t) return { error: "This link is invalid, already used, or expired. Ask your platform administrator for a new one." };
    const pw = String(fd.get("password") ?? ""), pw2 = String(fd.get("password2") ?? "");
    if (pw !== pw2) return { error: "The passwords don't match." };
    const problems = passwordProblems(pw, t.email);
    if (problems.length) return { error: problems.join(" ") };
    if (t.role === "super_admin") return { error: "Super Admin credentials are managed through the recovery procedure." };
    if (t.status === "revoked" || t.status === "suspended") return { error: "This account is not active. Contact your platform administrator." };
    const name = str(fd, "name");
    const used = await sql()`update auth_tokens set used_at = now() where id = ${t.id} and used_at is null returning id`;
    if (!used.length) return { error: "This link has already been used." };
    await sql()`update users set password_hash = ${await hashPassword(pw)}, status = 'active', failed_logins = 0, locked_until = null,
                 name = ${purpose === "invite" && name ? name.slice(0, 120) : t.name} where id = ${t.user_id}`;
    await sql()`update sessions set revoked_at = now() where user_id = ${t.user_id} and revoked_at is null`;
    await audit({ actorId: t.user_id, actorLabel: t.email, action: purpose === "invite" ? "auth.invite_accepted" : "auth.password_reset", ipHash: await getIpHash() });
    dest = "/admin/login?" + (purpose === "invite" ? "welcome=1" : "reset=1");
  });
  if (dest) redirect(dest);
  return res;
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const s = await getAdminSession();
    if (!s) redirect("/admin/login");
    const [u] = await sql()`select password_hash from users where id = ${s.user.id}`;
    if (!(await verifyPassword(u.password_hash, String(fd.get("current") ?? "")))) return { error: "Your current password is incorrect." };
    const pw = String(fd.get("password") ?? "");
    if (pw !== String(fd.get("password2") ?? "")) return { error: "The new passwords don't match." };
    const problems = passwordProblems(pw, s.user.email);
    if (problems.length) return { error: problems.join(" ") };
    await sql()`update users set password_hash = ${await hashPassword(pw)} where id = ${s.user.id}`;
    await sql()`update sessions set revoked_at = now() where user_id = ${s.user.id} and id <> ${s.sessionId} and revoked_at is null`;
    await audit({ actorId: s.user.id, actorLabel: s.user.email, action: "auth.password_changed", ipHash: await getIpHash() });
    return { ok: true, message: "Password changed. Your other sessions were signed out." };
  });
}

export async function revokeOtherSessionsAction(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const s = await getAdminSession();
    if (!s) redirect("/admin/login");
    const r = await sql()`update sessions set revoked_at = now() where user_id = ${s.user.id} and id <> ${s.sessionId} and revoked_at is null`;
    await audit({ actorId: s.user.id, actorLabel: s.user.email, action: "auth.sessions_revoked", details: { count: r.count }, ipHash: await getIpHash() });
    return { ok: true, message: `${r.count} other session(s) signed out.` };
  });
}

