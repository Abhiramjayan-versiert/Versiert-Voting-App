import "server-only";
import { cookies } from "next/headers";
import { sql, withCtx, systemCtx } from "./db";
import { env, isTestMode, emailEnabled } from "./env";
import { sendMailNow } from "./mailer";
import { hmac, randomToken, safeEqual, sha256, numericCode } from "./crypto";
import { normalizeEmail, normalizeStudentId } from "./email-normalize";
export { normalizeStudentId };
import { getConfig } from "./config";
import { rateLimit } from "./ratelimit";
import { securityEvent } from "./audit";
import { effectiveStatus } from "./lifecycle";

export const VOTER_COOKIE = "vapp_voter";
export const GENERIC_INVALID =
  "We couldn't verify those details for this election. Check your college email and student ID, or contact your election administrator if you need assistance.";

const emailKey = (electionId: string, email: string) => hmac(env().HMAC_SECRET, `voter:${electionId}:${email}`);

export async function electionBySlug(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{3,80}$/.test(slug)) return null;
  const [e] = await withCtx(systemCtx, (tx) => tx`
    select e.*, c.name as college_name, c.short_name as college_short, c.status as college_status,
           (c.logo is not null) as has_logo, (e.banner is not null) as has_banner
      from elections e join colleges c on c.id = e.college_id
     where e.slug = ${slug} and e.status <> 'draft'`);
  if (!e || e.college_status !== "active") return null;
  return { ...e, effective: effectiveStatus(e as never) } as Record<string, any>;
}

/**
 * Verifies a voter by college email + student ID, both of which must match the election's
 * voter list. No email is sent. Responses are identical for unknown emails and wrong IDs,
 * and attempts are limited per email address and per network to stop guessing.
 */
export async function verifyVoterIdentity(slug: string, rawEmail: string, rawStudentId: string, ipHash: string) {
  const cfg = await getConfig();
  const e = await electionBySlug(slug);
  if (!e || e.effective !== "open") return { ok: false, message: "Voting is not open for this election right now." };
  const email = normalizeEmail(rawEmail);
  const sid = normalizeStudentId(rawStudentId);
  if (!email || !sid) return { ok: false, message: "Enter your college email and your student ID." };

  const net = await rateLimit(`verify-ip:${ipHash}`, cfg.rate_otp_per_ip_per_hour, 3600);
  if (!net.ok) {
    await securityEvent({ kind: "verify_rate_limited", severity: "warning", collegeId: e.college_id, electionId: e.id, ipHash });
    return { ok: false, message: "Too many attempts from this network. Please wait and try again later." };
  }
  const key = emailKey(e.id, email);
  const per = await rateLimit(`verify-email:${key}`, cfg.otp_max_attempts, 3600);
  if (!per.ok) {
    if (per.count === cfg.otp_max_attempts + 1) {
      await securityEvent({ kind: "verify_attempts_exhausted", severity: "warning", collegeId: e.college_id, electionId: e.id, ipHash, requiresReview: false });
    }
    return { ok: false, message: "Too many attempts for this email. Please wait an hour or contact your election administrator." };
  }

  const voter = await withCtx(systemCtx, async (tx) => {
    const [v] = await tx`select id, student_id from voters where election_id = ${e.id} and email = ${email}`;
    // Compare in constant time against a keyed hash so timing doesn't reveal which part was wrong.
    const expected = hmac(env().HMAC_SECRET, "sid:" + normalizeStudentId(v?.student_id ?? "\u0000no-voter"));
    const given = hmac(env().HMAC_SECRET, "sid:" + sid);
    if (!v || !v.student_id || !safeEqual(expected, given)) return null;
    return v.id as string;
  });
  if (!voter) return { ok: false, message: GENERIC_INVALID };

  if (!requiresEmailCode(e)) {
    await startSession(slug, e.id, voter, cfg.voter_session_minutes);
    return { ok: true, message: "Verified" };
  }

  // Second step: a one-time code to the email on the voter list. Limited to 3 sends per 15 minutes.
  const sends = await rateLimit(`otp-send:${key}`, 3, 900);
  if (!sends.ok) return { ok: false, message: "A code was sent recently. Check your inbox and spam folder, or wait 15 minutes and try again." };
  const code = numericCode(6);
  await withCtx(systemCtx, async (tx) => {
    await tx`update otp_challenges set consumed_at = now() where election_id = ${e.id} and email_hmac = ${key} and consumed_at is null`;
    await tx`insert into otp_challenges (election_id, email_hmac, voter_id, code_hash, expires_at)
             values (${e.id}, ${key}, ${voter}, ${codeHash(e.id, email, code)}, now() + make_interval(mins => ${OTP_MINUTES}))`;
  });
  const sent = await sendMailNow({
    to: email,
    subject: `${code} is your voting code for ${e.title}`,
    text: `Your V.app voting code for "${e.title}" (${e.college_name}) is:\n\n${code}\n\nIt expires in ${OTP_MINUTES} minutes and can be used once.\n\nIf you did not request this, someone may be trying to vote in your name. Do not share this code, and tell your election administrator.\n\n— V.app · Your campus. Your choice.`,
  });
  if (!sent.ok) {
    await securityEvent({ kind: "otp_send_failed", severity: "warning", collegeId: e.college_id, electionId: e.id, details: { error: sent.error } });
    return { ok: false, message: "We couldn't send the code email right now. Please try again in a minute." };
  }
  return { ok: true, codeSent: true, message: `We've emailed a 6-digit code to ${maskEmail(email)}. It expires in ${OTP_MINUTES} minutes.` };
}

const OTP_MINUTES = 10;
const OTP_MAX_TRIES = 5;
const codeHash = (electionId: string, email: string, code: string) => hmac(env().HMAC_SECRET, `otp:${electionId}:${email}:${code}`);
const requiresEmailCode = (e: Record<string, any>) => e.require_email_code !== false && emailEnabled();

function maskEmail(email: string) {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`;
}

async function startSession(slug: string, electionId: string, voterId: string, minutes: number) {
  const token = randomToken();
  const expires = new Date(Date.now() + minutes * 60_000);
  await withCtx(systemCtx, (tx) => tx`insert into voter_sessions (token_hash, voter_id, election_id, expires_at) values (${sha256(token)}, ${voterId}, ${electionId}, ${expires})`);
  (await cookies()).set(VOTER_COOKIE, token, {
    httpOnly: true, secure: !isTestMode(), sameSite: "strict", path: `/e/${slug}`, expires,
  });
}

/** Step 2: checks the emailed code. Five wrong tries cancel the code; the student then requests a new one. */
export async function verifyVoterCode(slug: string, rawEmail: string, rawCode: string, ipHash: string) {
  const cfg = await getConfig();
  const e = await electionBySlug(slug);
  if (!e || e.effective !== "open") return { ok: false, message: "Voting is not open for this election right now." };
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (!email || code.length !== 6) return { ok: false, message: "Enter the 6-digit code from the email." };
  const net = await rateLimit(`otp-check-ip:${ipHash}`, cfg.rate_otp_per_ip_per_hour * 3, 3600);
  if (!net.ok) return { ok: false, message: "Too many attempts from this network. Please wait and try again later." };
  const key = emailKey(e.id, email);
  const voterId = await withCtx(systemCtx, async (tx) => {
    const [c] = await tx`select id, voter_id, code_hash, attempts from otp_challenges
                          where election_id = ${e.id} and email_hmac = ${key} and consumed_at is null and expires_at > now()
                          order by created_at desc limit 1 for update`;
    if (!c) return "expired" as const;
    if (!safeEqual(c.code_hash, codeHash(e.id, email, code))) {
      const tries = c.attempts + 1;
      await tx`update otp_challenges set attempts = ${tries}, consumed_at = case when ${tries} >= ${OTP_MAX_TRIES} then now() else null end where id = ${c.id}`;
      return tries >= OTP_MAX_TRIES ? ("locked" as const) : ("wrong" as const);
    }
    await tx`update otp_challenges set consumed_at = now() where id = ${c.id}`;
    return c.voter_id as string;
  });
  if (voterId === "expired") return { ok: false, message: "That code has expired or was already used. Request a new code." };
  if (voterId === "locked") {
    await securityEvent({ kind: "otp_attempts_exhausted", severity: "warning", collegeId: e.college_id, electionId: e.id, ipHash });
    return { ok: false, message: "Too many wrong codes. Request a new code." };
  }
  if (voterId === "wrong") return { ok: false, message: "That code isn't right. Check the latest email and try again." };
  await startSession(slug, e.id, voterId, cfg.voter_session_minutes);
  return { ok: true, message: "Verified" };
}

export async function getVoterSession(slug: string) {
  const token = (await cookies()).get(VOTER_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [r] = await withCtx(systemCtx, (tx) => tx`
    select vs.id as session_id, vs.expires_at, v.id as voter_id, v.voter_group, v.election_id, v.email
      from voter_sessions vs join voters v on v.id = vs.voter_id join elections e on e.id = vs.election_id
     where vs.token_hash = ${sha256(token)} and vs.revoked_at is null and vs.expires_at > now() and e.slug = ${slug}`);
  if (!r) return null;
  return { ...r, tokenHash: sha256(token) } as { session_id: string; expires_at: Date; voter_id: string; voter_group: string | null; election_id: string; email: string; tokenHash: string };
}

export async function endVoterSession(slug: string) {
  const c = await cookies();
  const token = c.get(VOTER_COOKIE)?.value;
  if (token) await sql()`update voter_sessions set revoked_at = now() where token_hash = ${sha256(token)}`;
  c.set(VOTER_COOKIE, "", { path: `/e/${slug}`, maxAge: 0 });
}

/** Ballot content for a verified voter: eligible positions, active candidates, already-voted flags. */
export async function ballotFor(electionId: string, voterId: string, voterGroup: string | null) {
  return withCtx(systemCtx, async (tx) => {
    const positions = await tx`
      select p.id, p.name, p.description, p.max_selections, p.sort_order,
             exists (select 1 from participations pa where pa.position_id = p.id and pa.voter_id = ${voterId}) as voted
        from positions p
       where p.election_id = ${electionId} and app.voter_eligible_for_position(${voterGroup}, p.eligible_groups)
       order by p.sort_order, p.name`;
    const candidates = await tx`
      select id, position_id, full_name, department, year_label, intro, manifesto, symbol, (photo is not null) as has_photo
        from candidates where election_id = ${electionId} and status = 'active' order by sort_order, full_name`;
    return { positions, candidates };
  });
}
