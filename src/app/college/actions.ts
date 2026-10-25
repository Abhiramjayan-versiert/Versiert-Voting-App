"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCollegeAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ipHash } from "@/lib/request";
import { run, str, optStr, bool, isUuid, zonedToUtc, readImage } from "@/lib/action-utils";
import * as E from "@/lib/elections";
import { UserError } from "@/lib/elections";
import { getConfig } from "@/lib/config";
import { normalizeEmail } from "@/lib/email-normalize";
import { parseSpreadsheet, validateRows, guessMapping, ImportError, type Mapping } from "@/lib/imports";
import type { ActionState } from "@/components/forms";

async function scope(electionId: string) {
  if (!isUuid(electionId)) throw new UserError("Election not found.");
  const { s, ctx } = await requireCollegeAdmin();
  const e = await E.getElection(ctx, electionId);
  if (!e) throw new UserError("Election not found or you do not have access to it."); // RLS hides other colleges
  return { s, ctx, e, a: { id: s.user.id, label: s.user.email, ipHash: await ipHash() } };
}
const refresh = (e: Record<string, any>) => revalidatePath(`/college/${e.college_id}/elections/${e.id}`, "layout");

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
const details = z.object({
  event_name: z.string().trim().min(2, "Event name is required.").max(160),
  title: z.string().trim().min(2, "Election title is required.").max(160),
  description: z.string().trim().max(4000).optional(),
  academic_year: z.string().trim().max(20).optional(),
  department: z.string().trim().max(120).optional(),
  timezone: z.enum(TIMEZONES as [string, ...string[]], { message: "Choose a supported timezone." }),
});
function parseDetails(fd: FormData): E.DetailsInput {
  const d = details.parse({ event_name: str(fd, "event_name"), title: str(fd, "title"), description: str(fd, "description") || undefined,
    academic_year: str(fd, "academic_year") || undefined, department: str(fd, "department") || undefined, timezone: str(fd, "timezone") });
  return { ...d, starts_at: zonedToUtc(str(fd, "starts_at"), d.timezone), ends_at: zonedToUtc(str(fd, "ends_at"), d.timezone) };
}

export async function createElectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "";
  const res = await run(async () => {
    const collegeId = str(fd, "college_id");
    const { s, ctx } = await requireCollegeAdmin(isUuid(collegeId) ? collegeId : "00000000-0000-0000-0000-000000000000");
    const id = await E.createElection(ctx, { id: s.user.id, label: s.user.email, ipHash: await ipHash() }, collegeId, parseDetails(fd));
    dest = `/college/${collegeId}/elections/${id}/voters?created=1`;
  });
  if (dest) redirect(dest);
  return res;
}

export async function updateDetailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    await E.updateDetails(ctx, a, e.id, parseDetails(fd));
    const banner = await readImage(fd.get("banner"), 800);
    if (banner) await E.setBanner(ctx, a, e.id, banner.bytes, banner.mime);
    else if (bool(fd, "remove_banner")) await E.setBanner(ctx, a, e.id, null, null);
    refresh(e);
    return { ok: true, message: "Event details saved." };
  });
}

export async function deleteDraftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "";
  const res = await run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    if (str(fd, "confirm_text") !== "DELETE") throw new UserError("Type DELETE to confirm.");
    await E.deleteDraft(ctx, a, e.id);
    dest = `/college/${e.college_id}/elections?deleted=1`;
  });
  if (dest) redirect(dest);
  return res;
}

// ---- Voter import (the spreadsheet is parsed in memory and never stored) -------
async function readUpload(fd: FormData) {
  const f = fd.get("file");
  if (!f || typeof f === "string" || f.size === 0) throw new UserError("Choose a .xlsx, .xls or .csv file.");
  const cfg = await getConfig();
  if (f.size > cfg.max_import_mb * 1048576) throw new UserError(`Files must be under ${cfg.max_import_mb} MB.`);
  const buf = new Uint8Array(await f.arrayBuffer());
  try { return { name: f.name, sheet: parseSpreadsheet(buf, f.name, cfg.max_import_rows), maxRows: cfg.max_import_rows }; }
  catch (err) { if (err instanceof ImportError) throw new UserError(err.message); throw err; }
}
function mappingFrom(fd: FormData, guess: Partial<Mapping>): Mapping {
  const n = (k: string, g?: number | null) => { const v = str(fd, k); return v === "" ? (g ?? null) : v === "-1" ? null : Number(v); };
  return { email: n("map_email", guess.email) ?? -1, name: n("map_name", guess.name), studentId: n("map_student_id", guess.studentId), group: n("map_group", guess.group) };
}

export async function previewImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e } = await scope(str(fd, "election_id"));
    const { sheet, name, maxRows } = await readUpload(fd);
    const guess = guessMapping(sheet.headers);
    const m = mappingFrom(fd, guess);
    const mapped = m.email >= 0 && m.studentId != null && m.studentId >= 0;
    const v = mapped ? validateRows(sheet, m) : null;
    return { ok: true, message: mapped ? undefined : "Choose the email and student ID columns below, then press “Re-check with these columns”.", data: {
      filename: name, headers: sheet.headers, sample: sheet.rows.slice(0, 8), total: sheet.rows.length, truncated: sheet.truncated, maxRows, mapping: m,
      accepted: v?.accepted.length ?? 0, rejected: v?.rejected.slice(0, 1000) ?? [], rejectedCount: v?.rejected.length ?? 0, duplicates: v?.duplicates ?? 0,
    } };
  });
}

export async function commitImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let sc: Awaited<ReturnType<typeof scope>> | null = null;
  let filename = "upload";
  try {
    sc = await scope(str(fd, "election_id"));
  } catch (err) { return run(async () => { throw err; }); }
  const res = await run(async () => {
    const { ctx, e, a } = sc!;
    const { sheet, name } = await readUpload(fd);
    filename = name;
    const m = mappingFrom(fd, guessMapping(sheet.headers));
    let v: ReturnType<typeof validateRows>;
    try { v = validateRows(sheet, m); } catch (err) { if (err instanceof ImportError) throw new UserError(err.message); throw err; }
    if (v.accepted.length === 0) throw new UserError("No valid rows to import. Fix the file and try again.");
    const r = await E.commitImport(ctx, a, e.id, name, v, { ...m, headers: sheet.headers });
    refresh(e);
    return { ok: true, message: `Imported ${r.inserted} voter(s). ${r.alreadyRegistered} already on the list, ${v.rejected.length} rejected.`, data: { importId: r.importId, rejected: v.rejected.length } };
  });
  if (res?.error && sc) { await E.recordFailedImport(sc.ctx, sc.a, sc.e.id, filename, res.error).catch(() => {}); }
  return res;
}

export async function addVoterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    const email = normalizeEmail(str(fd, "email"));
    if (!email) throw new UserError("Enter a valid email address.");
    await E.addVoter(ctx, a, e.id, email, optStr(fd, "name"), optStr(fd, "student_id"), optStr(fd, "voter_group"));
    refresh(e);
    return { ok: true, message: `${email} added.` };
  });
}

export async function removeVotersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    const all = str(fd, "scope") === "all";
    if (all && str(fd, "confirm_text") !== "REMOVE ALL") throw new UserError("Type REMOVE ALL to confirm.");
    const ids = fd.getAll("voter_id").map(String).filter(isUuid);
    if (!all && !ids.length) throw new UserError("Select at least one voter.");
    const n = await E.removeVoters(ctx, a, e.id, all ? "all" : ids);
    refresh(e);
    return { ok: true, message: `${n} voter(s) removed.` };
  });
}

/** Super Admin only: single-use voting link for a listed voter who can't verify (typo in the uploaded details). */
export async function issueVotingPassAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { s, ctx, e, a } = await scope(str(fd, "election_id"));
    if (s.user.role !== "super_admin") throw new UserError("Only the Super Admin can give direct voting access.");
    if (e.effective !== "open") throw new UserError("Voting is not open right now.");
    const reason = str(fd, "reason");
    if (reason.length < 10) throw new UserError("Give a reason of at least 10 characters (e.g. how you confirmed it's the student).");
    const id = str(fd, "voter_id"); if (!isUuid(id)) throw new UserError("Voter not found.");
    const [v] = await withCtx(ctx, (tx) => tx`select email from voters where id = ${id} and election_id = ${e.id}`);
    if (!v) throw new UserError("Voter not found.");
    const { issueVotingPass } = await import("@/lib/voter");
    const { env } = await import("@/lib/env");
    const pass = await issueVotingPass(e.id, id, v.email);
    await withCtx(ctx, (tx) => audit({ actorId: a.id, actorLabel: a.label, collegeId: e.college_id, electionId: e.id, action: "voter.voting_pass_issued", target: v.email, details: { reason }, ipHash: a.ipHash }, tx));
    return { ok: true, message: `Single-use voting link for ${v.email}, valid ${pass.minutes} minutes. Send it only to this student.`,
      data: { link: `${env().APP_URL}/e/${e.slug}/pass/${pass.token}` } };
  });
}

// ---- Positions & candidates ------------------------------------------------
export async function upsertPositionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    const name = str(fd, "name");
    if (name.length < 1 || name.length > 120) throw new UserError("Position name is required (max 120 characters).");
    const seats = Number(str(fd, "max_selections") || 1);
    if (!Number.isInteger(seats) || seats < 1 || seats > 20) throw new UserError("Selections per voter must be between 1 and 20.");
    const groups = str(fd, "eligible_groups").split(",").map((g) => g.trim()).filter(Boolean).slice(0, 50);
    const pid = str(fd, "position_id");
    await E.upsertPosition(ctx, a, e.id, isUuid(pid) ? pid : null, { name, description: optStr(fd, "description"), max_selections: seats, eligible_groups: groups.length ? groups : null });
    refresh(e);
    return { ok: true, message: isUuid(pid) ? "Position updated." : `“${name}” added.` };
  });
}
export async function deletePositionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => { const { ctx, e, a } = await scope(str(fd, "election_id")); await E.deletePosition(ctx, a, e.id, str(fd, "position_id")); refresh(e); return { ok: true, message: "Position removed." }; });
}
export async function movePositionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => { const { ctx, e, a } = await scope(str(fd, "election_id")); await E.movePosition(ctx, a, e.id, str(fd, "position_id"), str(fd, "dir") === "up" ? -1 : 1); refresh(e); return { ok: true }; });
}
export async function upsertCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    const c = z.object({
      full_name: z.string().trim().min(1, "Candidate name is required.").max(120),
      department: z.string().trim().max(120).nullable(), year_label: z.string().trim().max(40).nullable(), student_id: z.string().trim().max(40).nullable(),
      intro: z.string().trim().max(500, "Introduction: max 500 characters.").nullable(), manifesto: z.string().trim().max(5000, "Manifesto: max 5,000 characters.").nullable(),
      symbol: z.string().trim().max(40).nullable(),
    }).parse({ full_name: str(fd, "full_name"), department: optStr(fd, "department"), year_label: optStr(fd, "year_label"), student_id: optStr(fd, "student_id"),
      intro: optStr(fd, "intro"), manifesto: optStr(fd, "manifesto"), symbol: optStr(fd, "symbol") });
    const cfg = await getConfig();
    const photo = bool(fd, "remove_photo") ? "remove" as const : cfg.feature_candidate_photos ? await readImage(fd.get("photo"), 600) : null;
    const cid = str(fd, "candidate_id");
    await E.upsertCandidate(ctx, a, e.id, str(fd, "position_id"), isUuid(cid) ? cid : null, c, photo);
    refresh(e);
    return { ok: true, message: isUuid(cid) ? "Candidate updated." : `${c.full_name} added.` };
  });
}
export async function deleteCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => { const { ctx, e, a } = await scope(str(fd, "election_id")); await E.deleteCandidate(ctx, a, e.id, str(fd, "candidate_id")); refresh(e); return { ok: true, message: "Candidate removed." }; });
}
export async function candidateStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    const st = str(fd, "status"); if (!["active", "withdrawn", "disqualified"].includes(st)) throw new UserError("Invalid status.");
    await E.setCandidateStatus(ctx, a, e.id, str(fd, "candidate_id"), st as never, str(fd, "reason"));
    refresh(e); return { ok: true, message: "Candidate status updated." };
  });
}

// ---- Rules -------------------------------------------------------------------
export async function updateRulesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, e, a } = await scope(str(fd, "election_id"));
    await E.updateRules(ctx, a, e.id, {
      secret_ballot: str(fd, "ballot_type") !== "open", allow_abstain: bool(fd, "allow_abstain"), require_all_positions: bool(fd, "require_all_positions"),
      admin_live_results: bool(fd, "admin_live_results"), results_require_approval: bool(fd, "results_require_approval"), allow_unpublish: bool(fd, "allow_unpublish"),
      retention_days: Number(str(fd, "retention_days")), keep_public_results: bool(fd, "keep_public_results"),
      require_email_code: bool(fd, "require_email_code"),
    });
    refresh(e);
    return { ok: true, message: "Voting rules saved." };
  });
}

// ---- Lifecycle ---------------------------------------------------------------
export async function lifecycleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { s, ctx, e, a } = await scope(str(fd, "election_id"));
    const op = str(fd, "op"), reason = str(fd, "reason");
    let message = "Done.";
    switch (op) {
      case "activate":
        if (!bool(fd, "ack")) throw new UserError("Confirm that you have reviewed the summary.");
        await E.activate(ctx, a, e.id); message = "Election activated. It opens automatically at the start time."; break;
      case "draft": await E.returnToDraft(ctx, a, e.id); message = "Returned to draft. You can edit everything again."; break;
      case "pause": await E.pause(ctx, a, e.id, reason); message = "Voting paused. Active voter sessions were ended."; break;
      case "resume": {
        const v = str(fd, "ends_at");
        await E.resume(ctx, a, e.id, v ? zonedToUtc(v, e.timezone) : undefined); message = "Voting resumed."; break;
      }
      case "close": await E.closeNow(ctx, a, e.id, reason); message = "Voting closed. The Super Admin reviews and publishes the results."; break;
      case "publish": {
        if (s.user.role !== "super_admin") throw new UserError("Only the Super Admin can publish results.");
        if (!bool(fd, "ack")) throw new UserError("Confirm that the election has closed and the integrity checks passed.");
        await E.publish(ctx, a, e.id); message = "Results published."; break;
      }
      case "unpublish": if (s.user.role !== "super_admin") throw new UserError("Only the Super Admin can unpublish results.");
        await E.unpublish(ctx, a, e.id, reason); message = "Results unpublished and back under review."; break;
      case "flag": await E.flagIncident(ctx, a, e.id, reason); message = "Incident recorded. Publication is blocked until it is resolved."; break;
      case "resolve": await E.resolveIncident(ctx, a, str(fd, "incident_id"), reason); message = "Incident resolved."; break;
      case "invite": { const n = await E.queueVoterEmails(ctx, a, e.id, "invitation"); message = `${n} invitation email(s) queued.`; break; }
      case "remind": { const n = await E.queueVoterEmails(ctx, a, e.id, "closing_reminder"); message = `${n} reminder email(s) queued for voters who haven't voted.`; break; }
      default: throw new UserError("Unknown action.");
    }
    refresh(e);
    return { ok: true, message };
  });
}
