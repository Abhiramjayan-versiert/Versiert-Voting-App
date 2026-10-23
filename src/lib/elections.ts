import "server-only";
import { randomBytes } from "node:crypto";
import { withCtx, systemCtx, type Ctx, type Sql } from "./db";
import { audit, securityEvent } from "./audit";
import { computeResults, type ElectionResult } from "./results";
import { effectiveStatus, purgeAfter, validateSchedule, type Status } from "./lifecycle";
import { sha256 } from "./crypto";
import { queueNotification } from "./mailer";
import { getConfig } from "./config";
import { env } from "./env";

export class UserError extends Error {}

export type Actor = { id: string; label: string; ipHash?: string | null };

export function slugify(s: string) {
  const base = s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "election";
  return `${base.length < 4 ? base + "-vote" : base}-${randomBytes(3).toString("hex")}`;
}
const publicRef = () => "E-" + randomBytes(5).toString("hex").toUpperCase();

/** Loads an election through RLS. Returns null for elections outside the caller's colleges. */
export async function getElection(ctx: Ctx, id: string, tx?: Sql) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const run = async (t: Sql) => {
    const [e] = await t`select e.*, c.name as college_name, (e.banner is not null) as has_banner
                          from elections e join colleges c on c.id = e.college_id where e.id = ${id}`;
    return e ? ({ ...e, effective: effectiveStatus(e as never) } as Record<string, any>) : null;
  };
  return tx ? run(tx) : withCtx(ctx, run);
}

async function mustGet(ctx: Ctx, tx: Sql, id: string, lock = false) {
  const [e] = lock
    ? await tx`select * from elections where id = ${id} for no key update`
    : await tx`select * from elections where id = ${id}`;
  if (!e) throw new UserError("Election not found or you do not have access to it.");
  return { ...e, effective: effectiveStatus(e as never) } as Record<string, any>;
}
function mustBeDraft(e: Record<string, any>) {
  if (e.status !== "draft") throw new UserError("This election has been activated. Return it to draft (before voting starts) or use pause-and-amend to make changes.");
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------
export type DetailsInput = {
  event_name: string; title: string; description?: string | null; academic_year?: string | null; department?: string | null;
  starts_at: Date; ends_at: Date; timezone: string;
};

export async function createElection(ctx: Ctx, actor: Actor, collegeId: string, d: DetailsInput) {
  const errs = validateSchedule(d.starts_at, d.ends_at);
  if (errs.length) throw new UserError(errs.join(" "));
  const cfg = await getConfig();
  return withCtx(ctx, async (tx) => {
    const [col] = await tx`select id, default_retention_days, status from colleges where id = ${collegeId}`;
    if (!col) throw new UserError("College not found.");
    if (col.status !== "active") throw new UserError("This college is suspended.");
    const retention = cfg.allowed_retention_days.includes(col.default_retention_days) ? col.default_retention_days : cfg.default_retention_days;
    const [e] = await tx`
      insert into elections (college_id, slug, public_ref, event_name, title, description, academic_year, department,
                             starts_at, ends_at, timezone, retention_days, created_by)
      values (${collegeId}, ${slugify(d.title)}, ${publicRef()}, ${d.event_name}, ${d.title}, ${d.description ?? null},
              ${d.academic_year ?? null}, ${d.department ?? null}, ${d.starts_at}, ${d.ends_at}, ${d.timezone}, ${retention}, ${actor.id})
      returning id`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId, electionId: e.id, action: "election.create", target: d.title, ipHash: actor.ipHash }, tx);
    return e.id as string;
  });
}

export async function updateDetails(ctx: Ctx, actor: Actor, id: string, d: DetailsInput) {
  const errs = validateSchedule(d.starts_at, d.ends_at);
  if (errs.length) throw new UserError(errs.join(" "));
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, id, true); mustBeDraft(e);
    await tx`update elections set event_name = ${d.event_name}, title = ${d.title}, description = ${d.description ?? null},
               academic_year = ${d.academic_year ?? null}, department = ${d.department ?? null},
               starts_at = ${d.starts_at}, ends_at = ${d.ends_at}, timezone = ${d.timezone} where id = ${id}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId: id, action: "election.update_details", ipHash: actor.ipHash }, tx);
  });
}

export type RulesInput = {
  secret_ballot: boolean; allow_abstain: boolean; require_all_positions: boolean; admin_live_results: boolean;
  results_require_approval: boolean; allow_unpublish: boolean; retention_days: number; keep_public_results: boolean;
};
export async function updateRules(ctx: Ctx, actor: Actor, id: string, r: RulesInput) {
  const cfg = await getConfig();
  if (!cfg.allowed_retention_days.includes(r.retention_days)) throw new UserError("Choose one of the permitted retention periods.");
  if (!r.secret_ballot && !cfg.feature_open_ballot) throw new UserError("Open (non-secret) ballots are disabled on this platform.");
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, id, true); mustBeDraft(e);
    await tx`update elections set secret_ballot = ${r.secret_ballot}, allow_abstain = ${r.allow_abstain},
               require_all_positions = ${r.require_all_positions}, admin_live_results = ${r.admin_live_results},
               results_require_approval = ${r.results_require_approval}, allow_unpublish = ${r.allow_unpublish},
               retention_days = ${r.retention_days}, keep_public_results = ${r.keep_public_results} where id = ${id}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId: id, action: "election.update_rules", details: { ...r }, ipHash: actor.ipHash }, tx);
  });
}

export async function setBanner(ctx: Ctx, actor: Actor, id: string, bytes: Buffer | null, mime: string | null) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, id, true); mustBeDraft(e);
    await tx`update elections set banner = ${bytes}, banner_mime = ${mime} where id = ${id}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId: id, action: bytes ? "election.banner_set" : "election.banner_removed", ipHash: actor.ipHash }, tx);
  });
}

export async function deleteDraft(ctx: Ctx, actor: Actor, id: string) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, id, true); mustBeDraft(e);
    await tx`delete from elections where id = ${id}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, action: "election.delete_draft", target: e.title, ipHash: actor.ipHash }, tx);
  });
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------
export type PositionInput = { name: string; description?: string | null; max_selections: number; eligible_groups: string[] | null };

export async function upsertPosition(ctx: Ctx, actor: Actor, electionId: string, positionId: string | null, p: PositionInput) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true); mustBeDraft(e);
    try {
      if (positionId) {
        const r = await tx`update positions set name = ${p.name}, description = ${p.description ?? null}, max_selections = ${p.max_selections},
                             eligible_groups = ${p.eligible_groups} where id = ${positionId} and election_id = ${electionId} returning id`;
        if (!r.length) throw new UserError("Position not found.");
      } else {
        await tx`insert into positions (election_id, college_id, name, description, max_selections, eligible_groups, sort_order)
                 values (${electionId}, ${e.college_id}, ${p.name}, ${p.description ?? null}, ${p.max_selections}, ${p.eligible_groups},
                         (select coalesce(max(sort_order), 0) + 1 from positions where election_id = ${electionId}))`;
      }
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new UserError("A position with that name already exists.");
      throw err;
    }
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: positionId ? "position.update" : "position.create", target: p.name, ipHash: actor.ipHash }, tx);
  });
}

export async function deletePosition(ctx: Ctx, actor: Actor, electionId: string, positionId: string) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true); mustBeDraft(e);
    const [p] = await tx`delete from positions where id = ${positionId} and election_id = ${electionId} returning name`;
    if (!p) throw new UserError("Position not found.");
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "position.delete", target: p.name, ipHash: actor.ipHash }, tx);
  });
}

export async function movePosition(ctx: Ctx, actor: Actor, electionId: string, positionId: string, dir: -1 | 1) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true); mustBeDraft(e);
    const list = await tx`select id from positions where election_id = ${electionId} order by sort_order, name`;
    const ids = list.map((r) => r.id as string);
    const i = ids.indexOf(positionId), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (let k = 0; k < ids.length; k++) await tx`update positions set sort_order = ${k + 1} where id = ${ids[k]}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "position.reorder", ipHash: actor.ipHash }, tx);
  });
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
export type CandidateInput = {
  full_name: string; department?: string | null; year_label?: string | null; student_id?: string | null;
  intro?: string | null; manifesto?: string | null; symbol?: string | null;
};

export async function upsertCandidate(ctx: Ctx, actor: Actor, electionId: string, positionId: string, candidateId: string | null,
  c: CandidateInput, photo?: { bytes: Buffer; mime: string } | "remove" | null) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true); mustBeDraft(e);
    const [pos] = await tx`select id from positions where id = ${positionId} and election_id = ${electionId}`;
    if (!pos) throw new UserError("Position not found.");
    if (c.student_id) {
      const [v] = await tx`select count(*)::int as n from voters where election_id = ${electionId}`;
      const [m] = await tx`select count(*)::int as n from voters where election_id = ${electionId} and lower(student_id) = lower(${c.student_id})`;
      if (v.n > 0 && m.n === 0) throw new UserError("That student ID is not on this election's voter list. Candidates must belong to the college.");
    }
    let id = candidateId;
    if (candidateId) {
      const r = await tx`update candidates set full_name = ${c.full_name}, department = ${c.department ?? null}, year_label = ${c.year_label ?? null},
                           student_id = ${c.student_id ?? null}, intro = ${c.intro ?? null}, manifesto = ${c.manifesto ?? null}, symbol = ${c.symbol ?? null}
                          where id = ${candidateId} and election_id = ${electionId} and position_id = ${positionId} returning id`;
      if (!r.length) throw new UserError("Candidate not found.");
    } else {
      const [r] = await tx`insert into candidates (position_id, election_id, college_id, full_name, department, year_label, student_id, intro, manifesto, symbol, sort_order)
                           values (${positionId}, ${electionId}, ${e.college_id}, ${c.full_name}, ${c.department ?? null}, ${c.year_label ?? null},
                                   ${c.student_id ?? null}, ${c.intro ?? null}, ${c.manifesto ?? null}, ${c.symbol ?? null},
                                   (select coalesce(max(sort_order), 0) + 1 from candidates where position_id = ${positionId})) returning id`;
      id = r.id;
    }
    if (photo === "remove") await tx`update candidates set photo = null, photo_mime = null where id = ${id}`;
    else if (photo) await tx`update candidates set photo = ${photo.bytes}, photo_mime = ${photo.mime} where id = ${id}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: candidateId ? "candidate.update" : "candidate.create", target: c.full_name, ipHash: actor.ipHash }, tx);
  });
}

export async function deleteCandidate(ctx: Ctx, actor: Actor, electionId: string, candidateId: string) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true); mustBeDraft(e);
    const [c] = await tx`delete from candidates where id = ${candidateId} and election_id = ${electionId} returning full_name`;
    if (!c) throw new UserError("Candidate not found.");
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "candidate.delete", target: c.full_name, ipHash: actor.ipHash }, tx);
  });
}

/** Withdraw/disqualify is permitted only while the election is PAUSED (pause-and-amend). Votes already cast are kept and reported. */
export async function setCandidateStatus(ctx: Ctx, actor: Actor, electionId: string, candidateId: string, status: "active" | "withdrawn" | "disqualified", reason: string) {
  if (reason.trim().length < 10) throw new UserError("Give a reason of at least 10 characters; it is recorded in the audit log.");
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (!(e.status === "draft" || e.status === "paused")) throw new UserError("Pause the election before changing a candidate's status.");
    const [c] = await tx`update candidates set status = ${status} where id = ${candidateId} and election_id = ${electionId} returning full_name`;
    if (!c) throw new UserError("Candidate not found.");
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "candidate.status", target: c.full_name, details: { status, reason }, ipHash: actor.ipHash }, tx);
  });
}

// ---------------------------------------------------------------------------
// Voters
// ---------------------------------------------------------------------------
export async function commitImport(ctx: Ctx, actor: Actor, electionId: string, filename: string,
  v: { total: number; accepted: { email: string; name: string | null; studentId: string | null; group: string | null }[]; rejected: { row: number; reason: string; raw: Record<string, string> }[]; duplicates: number },
  mapping: Record<string, unknown>) {
  return withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (!(e.status === "draft" || e.status === "paused")) throw new UserError("Voters can be imported while the election is a draft, or while paused for an amendment.");
    const [imp] = await tx`insert into voter_imports (election_id, college_id, filename, total_rows, rejected, duplicates, mapping, created_by)
                           values (${electionId}, ${e.college_id}, ${filename.slice(0, 200)}, ${v.total}, ${v.rejected.length}, ${v.duplicates}, ${tx.json(mapping as never)}, ${actor.id})
                           returning id`;
    let inserted = 0;
    for (let i = 0; i < v.accepted.length; i += 1000) {
      const chunk = v.accepted.slice(i, i + 1000).map((a) => ({
        election_id: electionId, college_id: e.college_id, email: a.email, name: a.name, student_id: a.studentId, voter_group: a.group, import_id: imp.id,
      }));
      const r = await tx`insert into voters ${tx(chunk)} on conflict (election_id, email) do nothing returning id`;
      inserted += r.length;
    }
    for (let i = 0; i < v.rejected.length; i += 1000) {
      const chunk = v.rejected.slice(i, i + 1000).map((r) => ({ import_id: imp.id, college_id: e.college_id, row_number: r.row, raw: r.raw, reason: r.reason }));
      await tx`insert into import_errors ${tx(chunk)}`;
    }
    await tx`update voter_imports set accepted = ${inserted}, already_registered = ${v.accepted.length - inserted} where id = ${imp.id}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "voters.import", target: filename,
      details: { total: v.total, accepted: inserted, rejected: v.rejected.length, duplicates: v.duplicates, already_registered: v.accepted.length - inserted }, ipHash: actor.ipHash }, tx);
    return { importId: imp.id as string, inserted, alreadyRegistered: v.accepted.length - inserted };
  });
}

export async function recordFailedImport(ctx: Ctx, actor: Actor, electionId: string, filename: string, error: string) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId);
    await tx`insert into voter_imports (election_id, college_id, filename, status, error, created_by) values (${electionId}, ${e.college_id}, ${filename.slice(0, 200)}, 'failed', ${error.slice(0, 500)}, ${actor.id})`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "voters.import_failed", target: filename, details: { error }, ipHash: actor.ipHash }, tx);
  });
}

export async function addVoter(ctx: Ctx, actor: Actor, electionId: string, email: string, name: string | null, studentId: string | null, group: string | null) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (!(e.status === "draft" || e.status === "paused")) throw new UserError("Voters can be added while the election is a draft, or while paused for an amendment.");
    const r = await tx`insert into voters (election_id, college_id, email, name, student_id, voter_group)
                       values (${electionId}, ${e.college_id}, ${email}, ${name}, ${studentId}, ${group}) on conflict do nothing returning id`;
    if (!r.length) throw new UserError("That email is already on the voter list.");
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "voters.add", details: { email_hash: sha256(email).slice(0, 16) }, ipHash: actor.ipHash }, tx);
  });
}

export async function removeVoters(ctx: Ctx, actor: Actor, electionId: string, ids: string[] | "all") {
  return withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true); mustBeDraft(e);
    const r = ids === "all"
      ? await tx`delete from voters where election_id = ${electionId}`
      : await tx`delete from voters where election_id = ${electionId} and id = any(${ids}::uuid[])`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "voters.remove", details: { count: r.count }, ipHash: actor.ipHash }, tx);
    return r.count;
  });
}

// ---------------------------------------------------------------------------
// Activation & lifecycle
// ---------------------------------------------------------------------------
export async function readiness(ctx: Ctx, electionId: string, tx?: Sql) {
  const run = async (t: Sql) => {
    const e = await mustGet(ctx, t, electionId);
    const positions = await t`select p.id, p.name, p.max_selections, p.eligible_groups,
                                (select count(*)::int from candidates c where c.position_id = p.id and c.status = 'active') as candidates
                               from positions p where p.election_id = ${electionId} order by sort_order`;
    const [{ n: voters }] = await t`select count(*)::int as n from voters where election_id = ${electionId}`;
    const issues: string[] = [];
    if (!positions.length) issues.push("Add at least one position.");
    for (const p of positions) {
      if (p.candidates === 0) issues.push(`“${p.name}” has no candidates.`);
      else if (p.candidates < p.max_selections) issues.push(`“${p.name}” allows ${p.max_selections} selections but has only ${p.candidates} candidate(s).`);
      if (p.eligible_groups?.length) {
        const [{ n }] = await t`select count(*)::int as n from voters where election_id = ${electionId} and app.voter_eligible_for_position(voter_group, ${p.eligible_groups})`;
        if (n === 0) issues.push(`No voter is eligible for “${p.name}” (groups: ${p.eligible_groups.join(", ")}).`);
      }
    }
    if (voters === 0) issues.push("Import at least one eligible voter.");
    issues.push(...validateSchedule(new Date(e.starts_at), new Date(e.ends_at)));
    return { ok: issues.length === 0, issues, voters, positions };
  };
  return tx ? run(tx) : withCtx(ctx, run);
}

export async function activate(ctx: Ctx, actor: Actor, electionId: string) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true); mustBeDraft(e);
    const r = await readiness(ctx, electionId, tx);
    if (!r.ok) throw new UserError("Not ready to open: " + r.issues.join(" "));
    await tx`update elections set status = 'scheduled', activated_at = now(), activated_by = ${actor.id} where id = ${electionId}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "election.activate",
      details: { starts_at: e.starts_at, ends_at: e.ends_at, voters: r.voters, positions: r.positions.length }, ipHash: actor.ipHash }, tx);
  });
}

export async function returnToDraft(ctx: Ctx, actor: Actor, electionId: string) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (e.status !== "scheduled" || e.effective !== "scheduled") throw new UserError("Only a scheduled election that has not started can return to draft.");
    await tx`update elections set status = 'draft', activated_at = null, activated_by = null where id = ${electionId}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "election.return_to_draft", ipHash: actor.ipHash }, tx);
  });
}

export async function pause(ctx: Ctx, actor: Actor, electionId: string, reason: string) {
  if (reason.trim().length < 10) throw new UserError("Give a reason of at least 10 characters.");
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (e.effective !== "open") throw new UserError("Only an open election can be paused.");
    await tx`update elections set status = 'paused' where id = ${electionId}`;
    await tx`update voter_sessions set revoked_at = now() where election_id = ${electionId} and revoked_at is null`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "election.pause", details: { reason }, ipHash: actor.ipHash }, tx);
    await securityEvent({ kind: "election_paused", severity: "warning", collegeId: e.college_id, electionId, requiresReview: false, details: { reason } }, tx);
  });
}

export async function resume(ctx: Ctx, actor: Actor, electionId: string, newEndsAt?: Date) {
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (e.status !== "paused") throw new UserError("This election is not paused.");
    const ends = newEndsAt ?? new Date(e.ends_at);
    if (ends <= new Date()) throw new UserError("Set a closing time in the future before resuming.");
    if (ends < new Date(e.ends_at)) throw new UserError("The closing time can be extended but not brought forward. Close the election instead.");
    await tx`update elections set status = 'open', ends_at = ${ends} where id = ${electionId}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "election.resume", details: { ends_at: ends.toISOString(), extended: ends.getTime() !== new Date(e.ends_at).getTime() }, ipHash: actor.ipHash }, tx);
  });
}

export async function closeNow(ctx: Ctx, actor: Actor, electionId: string, reason: string) {
  if (reason.trim().length < 10) throw new UserError("Give a reason of at least 10 characters.");
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (!["open", "paused"].includes(e.effective)) throw new UserError("Only an open or paused election can be closed early.");
    await tx`update elections set status = 'results_pending', closed_at = now(), ends_at = least(ends_at, now()) where id = ${electionId}`;
    await tx`update voter_sessions set revoked_at = now() where election_id = ${electionId} and revoked_at is null`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "election.close_early", details: { reason }, ipHash: actor.ipHash }, tx);
  });
}

// ---------------------------------------------------------------------------
// Results & integrity
// ---------------------------------------------------------------------------
export async function computeElection(electionId: string, tx: Sql): Promise<ElectionResult & { positionsMeta: Record<string, unknown>[] }> {
  const positions = await tx`select id, name, sort_order, max_selections, eligible_groups from positions where election_id = ${electionId}`;
  const candidates = await tx`select id, position_id, full_name, status, sort_order from candidates where election_id = ${electionId}`;
  const tally = await tx`select position_id, candidate_id, votes::int from ballot.tally(${electionId})`;
  const part = await tx`select position_id, count(*)::int as n from participations where election_id = ${electionId} group by position_id`;
  const [{ n: eligibleVoters }] = await tx`select count(*)::int as n from voters where election_id = ${electionId}`;
  const [{ n: participatingVoters }] = await tx`select count(distinct voter_id)::int as n from participations where election_id = ${electionId}`;
  const eligibleByPosition: Record<string, number> = {};
  for (const p of positions) {
    const [{ n }] = await tx`select count(*)::int as n from voters where election_id = ${electionId} and app.voter_eligible_for_position(voter_group, ${p.eligible_groups})`;
    eligibleByPosition[p.id] = n;
  }
  const r = computeResults({
    positions: positions as never, candidates: candidates as never, tally: tally as never,
    participantsByPosition: Object.fromEntries(part.map((x) => [x.position_id, x.n])), eligibleByPosition, eligibleVoters, participatingVoters,
  });
  return { ...r, positionsMeta: positions as never };
}

export type IntegrityReport = { ok: boolean; checks: { name: string; ok: boolean; detail: string }[]; openIncidents: Record<string, any>[] };

export async function integrityReport(electionId: string, tx: Sql): Promise<IntegrityReport> {
  const checks: IntegrityReport["checks"] = [];
  const positions = await tx`select id, name, max_selections from positions where election_id = ${electionId}`;
  const tally = await tx`select position_id, candidate_id, votes::int from ballot.tally(${electionId})`;
  const part = await tx`select position_id, count(*)::int as n from participations where election_id = ${electionId} group by position_id`;
  for (const p of positions) {
    const participants = part.find((x) => x.position_id === p.id)?.n ?? 0;
    const rows = tally.filter((t) => t.position_id === p.id);
    const abst = rows.filter((r) => !r.candidate_id).reduce((s, r) => s + r.votes, 0);
    const marks = rows.filter((r) => r.candidate_id).reduce((s, r) => s + r.votes, 0);
    const ok = p.max_selections === 1 ? abst + marks === participants : abst + marks >= participants && marks + abst <= participants * p.max_selections;
    checks.push({ name: `Ballot count matches participation — ${p.name}`, ok, detail: `${participants} participant(s), ${marks} candidate mark(s), ${abst} abstention(s)` });
  }
  const [orphans] = await tx`select count(*)::int as n from ballot.tally(${electionId}) t
                               where t.candidate_id is not null and not exists (select 1 from candidates c where c.id = t.candidate_id and c.position_id = t.position_id)`;
  checks.push({ name: "Every vote references a valid candidate of its position", ok: orphans.n === 0, detail: `${orphans.n} invalid reference(s)` });
  const [noneligible] = await tx`select count(*)::int as n from participations pa join voters v on v.id = pa.voter_id join positions p on p.id = pa.position_id
                                   where pa.election_id = ${electionId} and not app.voter_eligible_for_position(v.voter_group, p.eligible_groups)`;
  checks.push({ name: "Every participation is by a voter eligible for that position", ok: noneligible.n === 0, detail: `${noneligible.n} ineligible participation(s)` });
  const [dups] = await tx`select count(*)::int as n from (select voter_id, position_id from participations where election_id = ${electionId} group by 1, 2 having count(*) > 1) d`;
  checks.push({ name: "No voter has more than one accepted vote per position", ok: dups.n === 0, detail: `${dups.n} duplicate(s)` });
  const [chain] = await tx`select * from app.verify_audit_chain()`;
  checks.push({ name: "Audit log hash chain is intact", ok: chain.ok, detail: chain.ok ? `${chain.checked} entries verified` : `Broken at entry ${chain.first_bad_id}` });
  const openIncidents = await tx`select id, at, kind, severity, details from security_events where election_id = ${electionId} and requires_review and resolved_at is null order by at`;
  checks.push({ name: "No unresolved integrity incidents", ok: openIncidents.length === 0, detail: `${openIncidents.length} open incident(s)` });
  return { ok: checks.every((c) => c.ok), checks, openIncidents: openIncidents as never };
}

export async function publish(ctx: Ctx, actor: Actor, electionId: string, opts: { auto?: boolean } = {}) {
  return withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (e.status !== "results_pending") throw new UserError("Results can be published only after the election has closed and is pending review.");
    const integrity = await integrityReport(electionId, tx);
    if (!integrity.ok) throw new UserError("Integrity checks have not all passed. Resolve the flagged items first.");
    const r = await computeElection(electionId, tx);
    const [col] = await tx`select name from colleges where id = ${e.college_id}`;
    const snapshot = {
      college: col.name, event_name: e.event_name, title: e.title, public_ref: e.public_ref, academic_year: e.academic_year,
      starts_at: e.starts_at, ends_at: e.ends_at, closed_at: e.closed_at ?? e.ends_at, timezone: e.timezone, secret_ballot: e.secret_ballot,
      generated_at: new Date().toISOString(),
      results: { eligibleVoters: r.eligibleVoters, participatingVoters: r.participatingVoters, turnoutPct: r.turnoutPct, positions: r.positions },
      integrity: integrity.checks.map((c) => ({ name: c.name, ok: c.ok })),
    };
    const body = JSON.stringify(snapshot);
    const [snap] = await tx`insert into result_snapshots (election_id, college_id, kind, data, data_hash, created_by)
                            values (${electionId}, ${e.college_id}, 'published', ${tx.json(snapshot as never)}, ${sha256(body)}, ${opts.auto ? null : actor.id}) returning id, created_at`;
    const now = new Date(snap.created_at);
    const purge = purgeAfter(now, e.retention_days);
    await tx`update elections set status = 'published', published_at = ${now}, published_by = ${opts.auto ? null : actor.id}, purge_after = ${purge} where id = ${electionId}`;
    await tx`insert into publication_history (election_id, college_id, action, snapshot_id, actor_id, note)
             values (${electionId}, ${e.college_id}, 'publish', ${snap.id}, ${opts.auto ? null : actor.id}, ${opts.auto ? "Automatically published (approval not required)" : null})`;
    await tx`insert into cleanup_jobs (election_id, college_id, run_after) values (${electionId}, ${e.college_id}, ${purge})
             on conflict (election_id) do update set run_after = excluded.run_after, status = 'scheduled', notified_at = null, last_error = null`;
    await audit({ actorId: opts.auto ? null : actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "results.publish",
      details: { snapshot_id: snap.id, data_hash: sha256(body), purge_after: purge.toISOString() }, ipHash: actor.ipHash }, tx);
    const admins = await tx`select u.email from college_admins ca join users u on u.id = ca.user_id where ca.college_id = ${e.college_id} and u.status = 'active'`;
    for (const a of admins) {
      await queueNotification({ to: a.email, kind: "results_published", collegeId: e.college_id, electionId, dedupeKey: `pub:${snap.id}:${a.email}`,
        subject: `Results published — ${e.title}`,
        text: `Results for "${e.title}" are now published.\n\nPublic results: ${env().APP_URL}/r/${e.public_ref}\n\nUnder the retention policy, the election's voter list and ballot data will be deleted on ${purge.toUTCString()}${e.keep_public_results ? "; the aggregate results page will remain available." : ", together with the results page."}\n\n— V.app` }, tx);
    }
    return snap.id as string;
  });
}

export async function unpublish(ctx: Ctx, actor: Actor, electionId: string, reason: string) {
  if (reason.trim().length < 10) throw new UserError("Give a reason of at least 10 characters.");
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId, true);
    if (e.status !== "published") throw new UserError("Results can only be unpublished during the correction window, before the retention period starts.");
    if (!e.allow_unpublish) throw new UserError("This election's policy does not permit unpublishing results.");
    await tx`update elections set status = 'results_pending', published_at = null, published_by = null, purge_after = null where id = ${electionId}`;
    await tx`delete from cleanup_jobs where election_id = ${electionId} and status in ('scheduled', 'notified')`;
    await tx`insert into publication_history (election_id, college_id, action, actor_id, note) values (${electionId}, ${e.college_id}, 'unpublish', ${actor.id}, ${reason})`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "results.unpublish", details: { reason }, ipHash: actor.ipHash }, tx);
  });
}

export async function resolveIncident(ctx: Ctx, actor: Actor, incidentId: string, resolution: string) {
  if (resolution.trim().length < 10) throw new UserError("Describe the resolution (at least 10 characters).");
  await withCtx(ctx, async (tx) => {
    const [i] = await tx`select * from security_events where id = ${incidentId}`;
    if (!i) throw new UserError("Incident not found.");
    if (ctx.role === "college_admin" && !ctx.collegeIds.includes(i.college_id)) throw new UserError("Incident not found.");
    await tx`update security_events set resolved_at = now(), resolved_by = ${actor.id}, resolution = ${resolution} where id = ${incidentId}`;
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: i.college_id, electionId: i.election_id, action: "incident.resolve", target: i.kind, details: { resolution }, ipHash: actor.ipHash }, tx);
  });
}

export async function flagIncident(ctx: Ctx, actor: Actor, electionId: string, description: string) {
  if (description.trim().length < 10) throw new UserError("Describe the incident (at least 10 characters).");
  await withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId);
    await securityEvent({ kind: "manual_integrity_flag", severity: "warning", collegeId: e.college_id, electionId, requiresReview: true, details: { description, reported_by: actor.label } }, tx);
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: "incident.flag", details: { description }, ipHash: actor.ipHash }, tx);
  });
}

// ---------------------------------------------------------------------------
// Notifications to voters (queued; never contain choices)
// ---------------------------------------------------------------------------
export async function queueVoterEmails(ctx: Ctx, actor: Actor, electionId: string, kind: "invitation" | "closing_reminder") {
  if (!(await getConfig()).email_notifications_enabled) throw new UserError("Email notifications are turned off by the platform administrator.");
  return withCtx(ctx, async (tx) => {
    const e = await mustGet(ctx, tx, electionId);
    if (!["scheduled", "open"].includes(e.effective)) throw new UserError("Emails can be sent when the election is scheduled or open.");
    const voters = kind === "invitation"
      ? await tx`select email from voters where election_id = ${electionId}`
      : await tx`select v.email from voters v where v.election_id = ${electionId} and not exists (select 1 from participations p where p.voter_id = v.id)`;
    const url = `${env().APP_URL}/e/${e.slug}`;
    const tzFmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: e.timezone }).format(new Date(d));
    let n = 0;
    const stamp = kind === "invitation" ? "inv" : `rem-${new Date().toISOString().slice(0, 13)}`;
    for (const v of voters) {
      const subject = kind === "invitation" ? `You're invited to vote — ${e.title}` : `Voting closes soon — ${e.title}`;
      const text = kind === "invitation"
        ? `Welcome to V.app. Your campus. Your choice.\n\nYou are on the voter list for "${e.title}" (${e.event_name}).\nVoting opens ${tzFmt(e.starts_at)} and closes ${tzFmt(e.ends_at)} (${e.timezone}).\n\nVote here: ${url}\nYou'll verify this email address with a one-time code. Every valid vote counts.`
        : `Reminder: voting for "${e.title}" closes ${tzFmt(e.ends_at)} (${e.timezone}).\n\nIf you haven't finished voting, go to ${url}\n\nEvery valid vote counts.`;
      await tx`insert into notifications (to_email, subject, body_text, kind, college_id, election_id, dedupe_key)
               values (${v.email}, ${subject}, ${text}, ${kind}, ${e.college_id}, ${electionId}, ${`${stamp}:${electionId}:${sha256(v.email).slice(0, 24)}`})
               on conflict (dedupe_key) do nothing`;
      n++;
    }
    await audit({ actorId: actor.id, actorLabel: actor.label, collegeId: e.college_id, electionId, action: `notify.${kind}`, details: { recipients: n }, ipHash: actor.ipHash }, tx);
    return n;
  });
}

export { systemCtx };
export type { Status };
