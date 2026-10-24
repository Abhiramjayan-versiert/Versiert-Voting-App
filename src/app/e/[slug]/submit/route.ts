import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getVoterSession, electionBySlug } from "@/lib/voter";
import { sameOrigin, ipHash } from "@/lib/request";
import { rateLimit } from "@/lib/ratelimit";
import { securityEvent } from "@/lib/audit";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  idempotencyKey: z.string().min(16).max(100).regex(/^[A-Za-z0-9-]+$/),
  // Random code made in the voter's browser; stored only with the anonymous selections (see migration 0010).
  checkCode: z.string().regex(/^VC-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/).optional(),
  choices: z.array(z.object({ position_id: z.string().uuid(), candidate_ids: z.array(z.string().uuid()).max(20) })).min(1).max(100),
});

const MESSAGES: Record<string, [number, string]> = {
  SESSION_INVALID: [401, "Your voting session has expired. Verify your email again — anything already submitted is safe."],
  ELECTION_NOT_OPEN: [409, "Voting is not open for this election right now. Nothing was recorded."],
  NOT_ELIGIBLE: [403, "Your email is not eligible for this election. Contact your election administrator if you need assistance."],
  NOT_ELIGIBLE_FOR_POSITION: [403, "Your ballot included a position you're not eligible for. Nothing was recorded — reload the ballot and try again."],
  INVALID_POSITION: [400, "Your ballot didn't match this election. Nothing was recorded — reload the page and try again."],
  INVALID_CANDIDATE: [400, "A selected candidate isn't valid for that position. Nothing was recorded — reload the page and try again."],
  TOO_MANY_SELECTIONS: [400, "You selected more candidates than allowed for a position. Nothing was recorded."],
  DUPLICATE_CANDIDATE: [400, "The same candidate was selected twice. Nothing was recorded."],
  DUPLICATE_POSITION_IN_BALLOT: [400, "A position appeared twice in your ballot. Nothing was recorded."],
  ABSTAIN_NOT_ALLOWED: [400, "Abstention isn't permitted in this election. Nothing was recorded."],
  ALL_POSITIONS_REQUIRED: [400, "This election requires a choice for every position. Nothing was recorded."],
  EMPTY_BALLOT: [400, "Your ballot is empty."],
  BAD_IDEMPOTENCY_KEY: [400, "Invalid request. Reload the page and try again."],
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if ((await getConfig()).maintenance_mode) return NextResponse.json({ error: "V.app is under maintenance. Nothing was recorded." }, { status: 503 });
  const ip = await ipHash();
  if (!(await rateLimit(`submit-ip:${ip}`, 300, 600)).ok) return NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429 });

  const session = await getVoterSession(slug);
  if (!session) return NextResponse.json({ error: MESSAGES.SESSION_INVALID[1], code: "SESSION_INVALID" }, { status: 401 });
  if (!(await rateLimit(`submit-voter:${session.voter_id}`, 20, 600)).ok) return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });

  let parsed: z.infer<typeof body>;
  try { parsed = body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Your ballot could not be read. Nothing was recorded — reload and try again." }, { status: 400 }); }

  try {
    const [row] = await sql().begin(async (tx) => {
      await tx`select set_config('ballot.check_code', ${parsed.checkCode ?? ""}, true)`;
      return tx`select ballot.cast_votes(${session.tokenHash}, ${parsed.idempotencyKey}, ${tx.json(parsed.choices as never)}) as r`;
    });
    const r = row.r as { receipt: string | null; replayed: boolean; positions: { position_id: string; status: string }[] };
    const dup = r.positions.filter((p) => p.status === "already_voted");
    if (dup.length && !r.replayed) {
      const e = await electionBySlug(slug);
      await securityEvent({ kind: "duplicate_vote_attempt", severity: "info", collegeId: e?.college_id, electionId: session.election_id, ipHash: ip,
        details: { positions: dup.length, voter_ref: session.voter_id.slice(0, 8) } });
    }
    return NextResponse.json({ ok: true, receipt: r.receipt, replayed: r.replayed, accepted: r.positions.filter((p) => p.status === "accepted").length, alreadyVoted: dup.length });
  } catch (err) {
    const code = (err as { message?: string }).message ?? "";
    const m = MESSAGES[code];
    if (m) {
      if (code !== "SESSION_INVALID" && code !== "ELECTION_NOT_OPEN") {
        await securityEvent({ kind: "invalid_ballot_rejected", severity: "warning", electionId: session.election_id, ipHash: ip, details: { reason: code } });
      }
      return NextResponse.json({ error: m[1], code }, { status: m[0] });
    }
    console.error("[submit] unexpected", (err as Error).name);
    return NextResponse.json({ error: "Your ballot could not be submitted. Nothing was recorded — please try again." }, { status: 500 });
  }
}
