import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { sql, withCtx, systemCtx, type Ctx } from "./db";
import { env, isTestMode } from "./env";
import { randomToken, sha256, decrypt, verifyTotp } from "./crypto";
import { getConfig } from "./config";

export const ADMIN_COOKIE = () => (isTestMode() ? "vapp_admin" : "__Host-vapp_admin");

export type AdminUser = {
  id: string; email: string; name: string; role: "super_admin" | "college_admin"; status: string;
  mfa_enabled: boolean; mfa_secret_enc: string | null;
};
export type AdminSession = { sessionId: string; mfaPassed: boolean; user: AdminUser; collegeIds: string[] };

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const; // OWASP 2024 baseline
export const hashPassword = (pw: string) => argonHash(pw, ARGON);
export const verifyPassword = async (h: string, pw: string) => { try { return await argonVerify(h, pw); } catch { return false; } };

export function passwordProblems(pw: string, email?: string) {
  const p: string[] = [];
  if (pw.length < 12) p.push("Use at least 12 characters.");
  if (pw.length > 200) p.push("Use at most 200 characters.");
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W_]/.test(pw)) p.push("Mix letters with numbers or symbols.");
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) p.push("Don't include your email name.");
  if (/^(password|qwerty|123456|letmein|welcome)/i.test(pw)) p.push("That password is too common.");
  return p;
}

export async function createAdminSession(userId: string, mfaPassed: boolean, ipHash: string, ua: string) {
  const cfg = await getConfig();
  const token = randomToken();
  const expires = new Date(Date.now() + cfg.admin_session_hours * 3600_000);
  await sql()`insert into sessions (user_id, token_hash, mfa_passed, ip_hash, user_agent, expires_at)
              values (${userId}, ${sha256(token)}, ${mfaPassed}, ${ipHash}, ${ua}, ${expires})`;
  (await cookies()).set(ADMIN_COOKIE(), token, {
    httpOnly: true, secure: !isTestMode(), sameSite: "lax", path: "/", expires,
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE())?.value;
  if (!token || token.length > 100) return null;
  const [row] = await sql()`
    select s.id as session_id, s.mfa_passed, s.last_seen_at, u.id, u.email, u.name, u.role, u.status, u.mfa_enabled, u.mfa_secret_enc
      from sessions s join users u on u.id = s.user_id
     where s.token_hash = ${sha256(token)} and s.revoked_at is null and s.expires_at > now()`;
  if (!row || row.status !== "active") return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
    await sql()`update sessions set last_seen_at = now() where id = ${row.session_id}`;
  }
  const collegeIds = row.role === "college_admin"
    ? (await withCtx(systemCtx, (tx) => tx`select ca.college_id from college_admins ca join colleges c on c.id = ca.college_id
                    where ca.user_id = ${row.id} and c.status = 'active'`)).map((r) => r.college_id as string)
    : [];
  return {
    sessionId: row.session_id, mfaPassed: row.mfa_passed, collegeIds,
    user: { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, mfa_enabled: row.mfa_enabled, mfa_secret_enc: row.mfa_secret_enc },
  };
}

export async function destroyAdminSession() {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE())?.value;
  if (token) await sql()`update sessions set revoked_at = now() where token_hash = ${sha256(token)}`;
  c.delete(ADMIN_COOKIE());
}

/** Is a second factor required for this user before they can do anything? */
async function mfaGate(s: AdminSession) {
  const cfg = await getConfig();
  const required = s.user.role === "super_admin" || cfg.admin_mfa_required || s.user.mfa_enabled;
  if (!required) return null;
  if (!s.user.mfa_enabled) return "/admin/mfa/setup";
  if (!s.mfaPassed) return "/admin/mfa";
  return null;
}

/** Page/action guard for the Super Admin portal. Always enforced on the server. */
export async function requireSuperAdmin(): Promise<{ s: AdminSession; ctx: Ctx }> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (s.user.role !== "super_admin") redirect("/forbidden");
  const gate = await mfaGate(s);
  if (gate) redirect(gate);
  return { s, ctx: { role: "super_admin", userId: s.user.id } };
}

/** Guard for college administrators. If collegeId is given, the admin must be assigned to it. */
export async function requireCollegeAdmin(collegeId?: string): Promise<{ s: AdminSession; ctx: Ctx }> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (s.user.role !== "college_admin") redirect(s.user.role === "super_admin" ? "/platform" : "/forbidden");
  const gate = await mfaGate(s);
  if (gate) redirect(gate);
  if (collegeId && !s.collegeIds.includes(collegeId)) redirect("/forbidden");
  return { s, ctx: { role: "college_admin", userId: s.user.id, collegeIds: s.collegeIds } };
}

/** Non-redirecting variant for API route handlers. */
export async function adminForApi(kind: "super_admin" | "college_admin") {
  const s = await getAdminSession();
  if (!s || s.user.role !== kind) return null;
  if (await mfaGate(s)) return null;
  const ctx: Ctx = kind === "super_admin" ? { role: "super_admin", userId: s.user.id } : { role: "college_admin", userId: s.user.id, collegeIds: s.collegeIds };
  return { s, ctx };
}

/** Verifies a TOTP code and rejects reuse of an already-accepted code (replay protection). */
export async function checkTotp(user: AdminUser, code: string, secretOverride?: string) {
  const secret = secretOverride ?? (user.mfa_secret_enc ? decrypt(user.mfa_secret_enc, env().ENCRYPTION_KEY) : null);
  if (!secret) return false;
  const counter = verifyTotp(secret, code.replace(/\s/g, ""));
  if (counter === null) return false;
  const r = await sql()`update users set mfa_last_counter = ${counter}
                         where id = ${user.id} and (mfa_last_counter is null or mfa_last_counter < ${counter}) returning id`;
  return r.length === 1;
}
