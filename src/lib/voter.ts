import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { sql, withCtx, systemCtx } from "./db";
import { env, isTestMode } from "./env";
import { hmac, numericCode, randomToken, safeEqual, sha256 } from "./crypto";
import { normalizeEmail } from "./email-normalize";
import { getConfig } from "./config";
import { rateLimit } from "./ratelimit";
import { sendMailNow } from "./mailer";
import { securityEvent } from "./audit";
import { effectiveStatus } from "./lifecycle";

export const VOTER_COOKIE = "vapp_voter";
export const GENERIC_CODE_SENT =
  "If this address is on the voter list for this election, a 6-digit code is on its way. Please check your email or contact your election administrator if you need assistance.";
export const GENERIC_CODE_INVALID = "That code is invalid or has expired. Request a new code, or contact your election administrator if you need assistance.";

const emailKey = (electionId: string, email: string) => hmac(env().HMAC_SECRET, `voter:${electionId}:${email}`);
const codeHash = (challengeId: string, code: string) => hmac(env().HMAC_SECRET, `otp:${challengeId}:${code}`);

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

export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(5000),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch { return false; }
}

export type CodeRequestResult = { ok: boolean; message: string; captchaRequired?: boolean };

export async function requestVoterCode(slug: string, rawEmail: string, ipHash: string, ip: string, captchaToken?: string): Promise<CodeRequestResult> {
  const cfg = await getConfig();
  const e = await electionBySlug(slug);
  if (!e) return { ok: false, message: "This election link is not available." };
  if (e.effective !== "open") return { ok: false, message: "Voting is not open for this election right now." };
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, message: "Enter a valid email address." };

  const ipLimit = await rateLimit(`otp-ip:${ipHash}`, cfg.rate_otp_per_ip_per_hour, 3600);
  if (!ipLimit.ok) {
    await securityEvent({ kind: "otp_rate_limited", severity: "warning", collegeId: e.college_id, electionId: e.id, ipHash });
    return { ok: false, message: "Too many requests from this network. Please wait and try again later." };
  }
  // Suspicious volume from one network → require a human challenge when Turnstile is configured.
  if (env().TURNSTILE_SECRET_KEY && ipLimit.count > 5 && !(await verifyTurnstile(captchaToken, ip))) {
    return { ok: false, message: "Please complete the verification challenge.", captchaRequired: true };
  }
  const key = emailKey(e.id, email);
  const perEmail = await rateLimit(`otp-email:${key}`, 5, 3600);
  if (!perEmail.ok) return { ok: true, message: GENERIC_CODE_SENT }; // stay uniform; don't send more mail

  const ttl = cfg.otp_ttl_minutes;
  await withCtx(systemCtx, async (tx) => {
    const [voter] = await tx`select id from voters where election_id = ${e.id} and email = ${email}`;
    const code = numericCode(6);
    const [ch] = await tx`insert into otp_challenges (election_id, email_hmac, voter_id, code_hash, expires_at)
                          values (${e.id}, ${key}, ${voter?.id ?? null}, 'pending', now() + make_interval(mins => ${ttl})) returning id`;
    await tx`update otp_challenges set code_hash = ${codeHash(ch.id, code)} where id = ${ch.id}`;
    // Invalidate older outstanding codes for this address.
    await tx`update otp_challenges set consumed_at = now() where election_id = ${e.id} and email_hmac = ${key} and id <> ${ch.id} and consumed_at is null`;
    if (voter) {
      const text = `Your V.app verification code for "${e.title}" is ${code}.\n\nIt expires in ${ttl} minutes. Never share this code — election staff will never ask for it.\n\nIf you didn't request this, you can ignore this email.\n\n— V.app · Your campus. Your choice.`;
      // Sent after the response so valid and invalid addresses take the same time to answer.
      after(async () => { await sendMailNow({ to: email, subject: `${code} is your V.app voting code`, text }); });
    }
  });
  return { ok: true, message: GENERIC_CODE_SENT };
}

export async function verifyVoterCode(slug: string, rawEmail: string, rawCode: string, ipHash: string) {
  const cfg = await getConfig();
  const e = await electionBySlug(slug);
  if (!e || e.effective !== "open") return { ok: false, message: "Voting is not open for this election right now." };
  const email = normalizeEmail(rawEmail);
  const code = (rawCode ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) return { ok: false, message: GENERIC_CODE_INVALID };
  const lim = await rateLimit(`otp-verify-ip:${ipHash}`, 60, 3600);
  if (!lim.ok) return { ok: false, message: "Too many attempts. Please wait and try again later." };

  const key = emailKey(e.id, email);
  const result = await withCtx(systemCtx, async (tx) => {
    const [ch] = await tx`select * from otp_challenges where election_id = ${e.id} and email_hmac = ${key}
                           and consumed_at is null and expires_at > now() order by created_at desc limit 1 for update`;
    if (!ch) return null;
    if (ch.attempts >= cfg.otp_max_attempts) return null;
    await tx`update otp_challenges set attempts = attempts + 1 where id = ${ch.id}`;
    if (!ch.voter_id || !safeEqual(ch.code_hash, codeHash(ch.id, code))) {
      if (ch.attempts + 1 >= cfg.otp_max_attempts) {
        await securityEvent({ kind: "otp_attempts_exhausted", severity: "warning", collegeId: e.college_id, electionId: e.id, ipHash }, tx);
      }
      return null;
    }
    await tx`update otp_challenges set consumed_at = now() where id = ${ch.id}`;
    const token = randomToken();
    const expires = new Date(Date.now() + cfg.voter_session_minutes * 60_000);
    await tx`insert into voter_sessions (token_hash, voter_id, election_id, expires_at) values (${sha256(token)}, ${ch.voter_id}, ${e.id}, ${expires})`;
    return { token, expires };
  });
  if (!result) return { ok: false, message: GENERIC_CODE_INVALID };
  (await cookies()).set(VOTER_COOKIE, result.token, {
    httpOnly: true, secure: !isTestMode(), sameSite: "strict", path: `/e/${slug}`, expires: result.expires,
  });
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
