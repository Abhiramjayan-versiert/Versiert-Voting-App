import "server-only";
import { cookies } from "next/headers";
import { sql, withCtx, systemCtx } from "./db";
import { env, isTestMode } from "./env";
import { hmac, randomToken, safeEqual, sha256 } from "./crypto";
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

  const result = await withCtx(systemCtx, async (tx) => {
    const [v] = await tx`select id, student_id from voters where election_id = ${e.id} and email = ${email}`;
    // Compare in constant time against a keyed hash so timing doesn't reveal which part was wrong.
    const expected = hmac(env().HMAC_SECRET, "sid:" + normalizeStudentId(v?.student_id ?? "\u0000no-voter"));
    const given = hmac(env().HMAC_SECRET, "sid:" + sid);
    if (!v || !v.student_id || !safeEqual(expected, given)) return null;
    const token = randomToken();
    const expires = new Date(Date.now() + cfg.voter_session_minutes * 60_000);
    await tx`insert into voter_sessions (token_hash, voter_id, election_id, expires_at) values (${sha256(token)}, ${v.id}, ${e.id}, ${expires})`;
    return { token, expires };
  });
  if (!result) return { ok: false, message: GENERIC_INVALID };
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
