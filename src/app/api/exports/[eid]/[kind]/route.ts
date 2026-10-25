import { NextResponse } from "next/server";
import { adminForApi } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { getElection, computeElection } from "@/lib/elections";
import { buildWorkbook, toCsv } from "@/lib/exports";
import { audit } from "@/lib/audit";
import { ipHash } from "@/lib/request";
import { isUuid } from "@/lib/action-utils";
import type { ElectionResult } from "@/lib/results";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fmt = (d: Date | string | null, tz: string) => d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(d)) : "";

export async function GET(req: Request, { params }: { params: Promise<{ eid: string; kind: string }> }) {
  const { eid, kind } = await params;
  const auth = await adminForApi("college_admin");
  if (!auth) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  if (!isUuid(eid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const e = await getElection(auth.ctx, eid); // RLS: other colleges' elections are invisible
  if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const st = e.effective as string;
  const published = st === "published" || st === "retention";
  // Candidate results: Super Admin any time after voting starts; college admins only after publication.
  const resultsAllowed = auth.ctx.role === "super_admin"
    ? ["open", "paused", "results_pending", "published", "retention", "deleted"].includes(st)
    : ["published", "retention", "deleted"].includes(st);
  const pubStatus = published ? `Published ${fmt(e.published_at, e.timezone)}` : st === "deleted" ? "Published (data since deleted)" : "PROVISIONAL — not published";
  const base = `${e.public_ref}-${e.slug.replace(/-[0-9a-f]{6}$/, "")}`.slice(0, 60);
  const send = (body: Buffer | string, name: string, type: string) => new NextResponse(body as BodyInit, {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
  const log = async (what: string) => audit({ actorId: auth.s.user.id, actorLabel: auth.s.user.email, collegeId: e.college_id, electionId: eid, action: "export.download", target: what, ipHash: await ipHash() });

  if (kind === "import-errors") {
    const imp = new URL(req.url).searchParams.get("import") ?? "";
    if (!isUuid(imp)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = await withCtx(auth.ctx, (tx) => tx`select ie.row_number, ie.reason, ie.raw from import_errors ie join voter_imports vi on vi.id = ie.import_id where vi.id = ${imp} and vi.election_id = ${eid} order by ie.row_number`);
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r.raw))));
    await log("import-errors");
    return send(toCsv(["Row", "Reason", ...cols], rows.map((r) => [r.row_number, r.reason, ...cols.map((c) => r.raw[c] ?? "")])), `${base}-rejected-rows.csv`, "text/csv; charset=utf-8");
  }

  if (kind === "ballots.csv") {
    if (!published) return NextResponse.json({ error: "Available after results are published." }, { status: 409 });
    const rows = await withCtx(auth.ctx, (tx) => tx`select * from ballot.bulletin(${eid})`);
    await log(kind);
    return send(toCsv(["Verification code", "Position", "Choice"], rows.map((r) => [r.check_code, r.position_name, r.candidate_name])), `${base}-anonymous-ballots.csv`, "text/csv; charset=utf-8");
  }

  if (kind === "audit.csv") {
    const rows = await withCtx(auth.ctx, (tx) => tx`select id, at, actor_label, action, target, details, hash from audit_events where election_id = ${eid} order by id`);
    await log(kind);
    return send(toCsv(["Entry", "Time (UTC)", "Actor", "Action", "Target", "Details", "Chain hash"], rows.map((r) => [r.id, new Date(r.at).toISOString(), r.actor_label, r.action, r.target, JSON.stringify(r.details), r.hash])), `${base}-audit.csv`, "text/csv; charset=utf-8");
  }

  if (kind === "participation.csv") {
    if (st === "draft") return NextResponse.json({ error: "Not available yet" }, { status: 409 });
    const rows = await withCtx(auth.ctx, (tx) => tx`
      select p.name as position, coalesce(v.voter_group, '(none)') as grp, count(*)::int as eligible,
             count(pa.id)::int as voted
        from positions p join voters v on v.election_id = p.election_id and app.voter_eligible_for_position(v.voter_group, p.eligible_groups)
        left join participations pa on pa.position_id = p.id and pa.voter_id = v.id
       where p.election_id = ${eid} group by p.sort_order, p.name, grp order by p.sort_order, grp`);
    await log(kind);
    return send(toCsv(["College", "Event", "Election reference", "Position", "Voter group", "Eligible", "Voted", "Turnout %"],
      rows.map((r) => [e.college_name, e.event_name, e.public_ref, r.position, r.grp, r.eligible, r.voted, r.eligible ? Math.round((r.voted * 10000) / r.eligible) / 100 : 0])), `${base}-participation.csv`, "text/csv; charset=utf-8");
  }

  if (!resultsAllowed) return NextResponse.json({ error: "Results are not available yet." }, { status: 409 });

  let r: ElectionResult;
  if (st === "deleted") {
    const [snap] = await withCtx(auth.ctx, (tx) => tx`select data from result_snapshots where election_id = ${eid} order by created_at desc limit 1`);
    if (!snap) return NextResponse.json({ error: "No retained results." }, { status: 410 });
    r = snap.data.results;
  } else {
    r = await withCtx(auth.ctx, (tx) => computeElection(eid, tx));
  }
  const closeTime = fmt(e.closed_at ?? e.ends_at, e.timezone);
  const outcome = (o: string | null, status: string) => (o === "winner" ? (published ? "Winner" : "Leading") : o === "tied" ? "Tie" : status === "no_votes" ? "No votes" : "");
  const candRows = r.positions.flatMap((p) => p.candidates.map((c) => [e.college_name, e.event_name, e.public_ref, p.name, c.name, c.id.slice(0, 8), c.votes, c.pct, outcome(c.outcome, p.status), closeTime, pubStatus]));
  const candCols = ["College", "Event", "Election reference", "Position", "Candidate", "Candidate ref", "Valid votes", "% of valid votes", "Winner / tie", "Election closed", "Publication status"];
  const posRows = r.positions.map((p) => [p.name, p.eligible, p.participants, p.turnoutPct, p.candidateVotes, p.abstentions,
    p.status === "tie" ? `Tie: ${p.candidates.filter((c) => c.outcome === "tied").map((c) => c.name).join(", ")}` : p.status === "no_votes" ? "No valid votes" : p.candidates.filter((c) => c.outcome === "winner").map((c) => c.name).join(", ")]);
  const posCols = ["Position", "Eligible voters", "Participants", "Turnout %", "Valid candidate votes", "Abstentions", "Winner / tie status"];

  if (kind === "candidates.csv") { await log(kind); return send(toCsv(candCols, candRows), `${base}-candidate-results.csv`, "text/csv; charset=utf-8"); }
  if (kind === "positions.csv") { await log(kind); return send(toCsv(posCols, posRows), `${base}-position-summary.csv`, "text/csv; charset=utf-8"); }

  if (kind === "report.xlsx") {
    const groups = st === "deleted" ? [] : await withCtx(auth.ctx, (tx) => tx`
      select coalesce(v.voter_group, '(none)') as grp, count(*)::int as eligible, count(distinct pa.voter_id)::int as voted
        from voters v left join participations pa on pa.voter_id = v.id where v.election_id = ${eid} group by 1 order by 1`);
    const buf = await buildWorkbook([
      { name: "Summary", columns: [{ header: "Field", width: 28 }, { header: "Value", width: 60 }], rows: [
        ["College", e.college_name], ["Event", e.event_name], ["Election", e.title], ["Election reference", e.public_ref], ["Academic year", e.academic_year ?? ""],
        ["Voting opened", fmt(e.starts_at, e.timezone)], ["Voting closed", closeTime], ["Timezone", e.timezone], ["Ballot type", e.secret_ballot ? "Secret" : "Open"],
        ["Eligible voters", r.eligibleVoters], ["Voters who participated", r.participatingVoters], ["Overall turnout %", r.turnoutPct],
        ["Publication status", pubStatus], ["Report generated", fmt(new Date(), e.timezone)], ["Generated by", "V.app"],
      ] },
      { name: "Candidate results", columns: candCols.map((h, i) => ({ header: h, width: [30, 30, 16, 24, 28, 14, 12, 16, 14, 22, 30][i], numFmt: i === 7 ? "0.00" : undefined })), rows: candRows },
      { name: "Position summary", columns: posCols.map((h, i) => ({ header: h, width: [26, 16, 14, 12, 20, 12, 40][i], numFmt: i === 3 ? "0.00" : undefined })), rows: posRows },
      { name: "Participation by group", columns: [{ header: "Voter group", width: 24 }, { header: "Eligible", width: 12 }, { header: "Voted (any position)", width: 22 }, { header: "Turnout %", width: 12, numFmt: "0.00" }],
        rows: groups.map((g) => [g.grp, g.eligible, g.voted, g.eligible ? Math.round((g.voted * 10000) / g.eligible) / 100 : 0]) },
    ], { title: `${e.title} — results` });
    await log(kind);
    return send(buf, `${base}-report.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  if (kind === "open-register.xlsx") {
    if (e.secret_ballot) return NextResponse.json({ error: "Secret-ballot elections have no voter-level record." }, { status: 403 });
    const rows = await withCtx(auth.ctx, (tx) => tx`select * from ballot.open_register(${eid})`);
    const buf = await buildWorkbook([{ name: "Open ballot record", columns: [{ header: "Voter email", width: 34 }, { header: "Name", width: 26 }, { header: "Position", width: 26 }, { header: "Choice", width: 28 }],
      rows: rows.map((x) => [x.voter_email, x.voter_name, x.position_name, x.candidate_name]) }], { title: `${e.title} — open ballot record` });
    await log(kind);
    return send(buf, `${base}-open-ballot-record.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  return NextResponse.json({ error: "Unknown export" }, { status: 404 });
}
