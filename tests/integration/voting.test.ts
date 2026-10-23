import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeElection, session, cast, castError, tally, ownerDb, appDb, closeDbs } from "./helpers";

afterAll(closeDbs);

describe("one vote per voter per position (core rule)", () => {
  it("accepts one Chairman vote, rejects a second, still allows Vice Chairman", async () => {
    const f = await makeElection();
    const s = await session(f, 0);
    const [chair, vice] = f.positions;

    const r1 = await cast(s, [{ position_id: chair.id, candidate_ids: [chair.cands[0]] }]);
    expect(r1.positions).toEqual([{ position_id: chair.id, status: "accepted" }]);
    expect(r1.receipt).toMatch(/^VA-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

    // Second attempt for the same position with a DIFFERENT candidate → not counted, first stands.
    const r2 = await cast(s, [{ position_id: chair.id, candidate_ids: [chair.cands[1]] }]);
    expect(r2.positions).toEqual([{ position_id: chair.id, status: "already_voted" }]);
    expect(r2.receipt).toBeNull();

    const r3 = await cast(s, [{ position_id: vice.id, candidate_ids: [vice.cands[1]] }]);
    expect(r3.positions[0].status).toBe("accepted");

    const t = await tally(f.electionId);
    expect(t.find((x) => x.candidate_id === chair.cands[0])?.votes).toBe(1);
    expect(t.find((x) => x.candidate_id === chair.cands[1])).toBeUndefined();
    expect(t.find((x) => x.candidate_id === vice.cands[1])?.votes).toBe(1);
    const [{ n }] = await ownerDb()`select count(*)::int as n from participations where election_id = ${f.electionId}`;
    expect(n).toBe(2);
  });

  it("mixed ballot: already-voted positions are skipped, new ones accepted", async () => {
    const f = await makeElection();
    const s = await session(f, 0);
    const [chair, vice] = f.positions;
    await cast(s, [{ position_id: chair.id, candidate_ids: [chair.cands[2]] }]);
    const r = await cast(s, [{ position_id: chair.id, candidate_ids: [chair.cands[0]] }, { position_id: vice.id, candidate_ids: [vice.cands[0]] }]);
    expect(r.positions).toEqual([{ position_id: chair.id, status: "already_voted" }, { position_id: vice.id, status: "accepted" }]);
    const t = await tally(f.electionId);
    expect(t.find((x) => x.candidate_id === chair.cands[0])).toBeUndefined();
  });

  it("50 concurrent submissions (different keys, tabs, sessions) accept exactly one", async () => {
    const f = await makeElection();
    const sessions = await Promise.all(Array.from({ length: 5 }, () => session(f, 0)));
    const chair = f.positions[0];
    const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) =>
      cast(sessions[i % 5], [{ position_id: chair.id, candidate_ids: [chair.cands[i % 3]] }])));
    const accepted = results.filter((r) => r.status === "fulfilled" && r.value.positions[0].status === "accepted").length;
    expect(accepted).toBe(1);
    const [{ n }] = await ownerDb()`select count(*)::int as n from ballot.selections where election_id = ${f.electionId}`;
    expect(n).toBe(1);
    const [{ p }] = await ownerDb()`select count(*)::int as p from participations where election_id = ${f.electionId}`;
    expect(p).toBe(1);
  });

  it("idempotent replay returns the same receipt and records nothing new", async () => {
    const f = await makeElection();
    const s = await session(f, 1);
    const idem = randomUUID();
    const ch = [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }];
    const a = await cast(s, ch, idem);
    const b = await cast(s, ch, idem);
    expect(b.replayed).toBe(true);
    expect(b.receipt).toBe(a.receipt);
    const [{ n }] = await ownerDb()`select count(*)::int as n from ballot.selections where election_id = ${f.electionId}`;
    expect(n).toBe(1);
    // concurrent replays of the same key
    const s2 = await session(f, 2); const idem2 = randomUUID();
    const rs = await Promise.all(Array.from({ length: 10 }, () => cast(s2, ch, idem2)));
    expect(new Set(rs.map((r) => r.receipt)).size).toBe(1);
  });

  it("different voters each get their own vote", async () => {
    const f = await makeElection({ voters: 10 });
    const chair = f.positions[0];
    await Promise.all(Array.from({ length: 10 }, async (_, i) => cast(await session(f, i), [{ position_id: chair.id, candidate_ids: [chair.cands[i % 2]] }])));
    const t = await tally(f.electionId);
    expect(t.reduce((s, r) => s + r.votes, 0)).toBe(10);
    expect(t.find((r) => r.candidate_id === chair.cands[0])?.votes).toBe(5);
  });
});

describe("server-side ballot validation", () => {
  it("rejects a candidate from another position or another election (tampered IDs)", async () => {
    const f = await makeElection(); const g = await makeElection();
    const s = await session(f, 0);
    expect(await castError(s, [{ position_id: f.positions[0].id, candidate_ids: [f.positions[1].cands[0]] }])).toBe("INVALID_CANDIDATE");
    expect(await castError(s, [{ position_id: f.positions[0].id, candidate_ids: [g.positions[0].cands[0]] }])).toBe("INVALID_CANDIDATE");
    expect(await castError(s, [{ position_id: g.positions[0].id, candidate_ids: [g.positions[0].cands[0]] }])).toBe("INVALID_POSITION");
    expect(await castError(s, [{ position_id: "not-a-uuid", candidate_ids: [] }])).toBe("INVALID_POSITION");
    expect(await castError(s, [{ position_id: f.positions[0].id, candidate_ids: ["nope"] }])).toBe("INVALID_CANDIDATE");
    const [{ n }] = await ownerDb()`select count(*)::int as n from participations where election_id = ${f.electionId}`;
    expect(n).toBe(0); // nothing written on failure
  });
  it("rejects invalid, expired and revoked sessions", async () => {
    const f = await makeElection();
    const ch = [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }];
    expect(await castError("0".repeat(64), ch)).toBe("SESSION_INVALID");
    const expired = await session(f, 0, -1);
    expect(await castError(expired, ch)).toBe("SESSION_INVALID");
    const s = await session(f, 1);
    await ownerDb()`update voter_sessions set revoked_at = now() where token_hash = ${s}`;
    expect(await castError(s, ch)).toBe("SESSION_INVALID");
  });
  it("a session for election A cannot vote in election B", async () => {
    const f = await makeElection(); const g = await makeElection();
    const s = await session(f, 0);
    expect(await castError(s, [{ position_id: g.positions[0].id, candidate_ids: [g.positions[0].cands[0]] }])).toBe("INVALID_POSITION");
  });
  it("rejects when not open: scheduled, paused, closed, draft", async () => {
    for (const o of [{ startH: 2, endH: 5, status: "scheduled" }, { status: "paused" }, { startH: -5, endH: -1 }, { status: "draft" }, { status: "results_pending" }]) {
      const f = await makeElection(o);
      const s = await session(f, 0);
      expect(await castError(s, [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }])).toBe("ELECTION_NOT_OPEN");
    }
  });
  it("enforces max selections, duplicates, abstention and require-all rules", async () => {
    const f = await makeElection({ positions: [{ name: "Council", cands: 4, seats: 2 }, { name: "Chair", cands: 2 }] });
    const s = await session(f, 0);
    const [council, chair] = f.positions;
    expect(await castError(s, [{ position_id: council.id, candidate_ids: council.cands.slice(0, 3) }])).toBe("TOO_MANY_SELECTIONS");
    expect(await castError(s, [{ position_id: council.id, candidate_ids: [council.cands[0], council.cands[0]] }])).toBe("DUPLICATE_CANDIDATE");
    expect(await castError(s, [{ position_id: chair.id, candidate_ids: [] }])).toBe("ABSTAIN_NOT_ALLOWED");
    expect(await castError(s, [{ position_id: chair.id, candidate_ids: [chair.cands[0]] }, { position_id: chair.id, candidate_ids: [chair.cands[1]] }])).toBe("DUPLICATE_POSITION_IN_BALLOT");
    expect(await castError(s, [])).toBe("EMPTY_BALLOT");
    const ok = await cast(s, [{ position_id: council.id, candidate_ids: council.cands.slice(0, 2) }]);
    expect(ok.positions[0].status).toBe("accepted");

    const g = await makeElection({ abstain: true, requireAll: true });
    const s2 = await session(g, 0);
    expect(await castError(s2, [{ position_id: g.positions[0].id, candidate_ids: [] }])).toBe("ALL_POSITIONS_REQUIRED");
    const r = await cast(s2, [{ position_id: g.positions[0].id, candidate_ids: [] }, { position_id: g.positions[1].id, candidate_ids: [g.positions[1].cands[0]] }]);
    expect(r.positions.every((p) => p.status === "accepted")).toBe(true);
    const t = await tally(g.electionId);
    expect(t.find((x) => x.position_id === g.positions[0].id && x.candidate_id === null)?.votes).toBe(1);
  });
  it("rejects withdrawn candidates and enforces position-specific eligibility", async () => {
    const f = await makeElection({ positions: [{ name: "CSE Rep", cands: 2, groups: ["CSE"] }, { name: "Chair", cands: 2 }], groups: ["CSE", "ECE"] });
    await ownerDb()`update candidates set status = 'withdrawn' where id = ${f.positions[1].cands[1]}`;
    const cse = await session(f, 0), ece = await session(f, 1);
    expect(await castError(ece, [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }])).toBe("NOT_ELIGIBLE_FOR_POSITION");
    expect(await castError(cse, [{ position_id: f.positions[1].id, candidate_ids: [f.positions[1].cands[1]] }])).toBe("INVALID_CANDIDATE");
    expect((await cast(cse, [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }])).positions[0].status).toBe("accepted");
  });
});

describe("secret ballot storage", () => {
  it("selections carry no voter reference or timestamp in a secret ballot", async () => {
    const f = await makeElection();
    await cast(await session(f, 0), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }]);
    const cols = await ownerDb()`select column_name from information_schema.columns where table_schema = 'ballot' and table_name = 'selections' order by ordinal_position`;
    expect(cols.map((c) => c.column_name)).toEqual(["id", "election_id", "position_id", "candidate_id", "voter_ref"]);
    const [row] = await ownerDb()`select * from ballot.selections where election_id = ${f.electionId}`;
    expect(row.voter_ref).toBeNull();
    const pcols = await ownerDb()`select column_name from information_schema.columns where table_name = 'participations'`;
    expect(pcols.map((c) => c.column_name)).not.toContain("candidate_id");
  });
  it("open ballots link choices to voters and expose them only via open_register", async () => {
    const f = await makeElection({ secret: false });
    await cast(await session(f, 0), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[1]] }]);
    const rows = await appDb()`select * from ballot.open_register(${f.electionId})`;
    expect(rows).toHaveLength(1);
    expect(rows[0].voter_email).toBe("s0@t.test");
    const g = await makeElection({ secret: true });
    await cast(await session(g, 0), [{ position_id: g.positions[0].id, candidate_ids: [g.positions[0].cands[0]] }]);
    expect(await appDb()`select * from ballot.open_register(${g.electionId})`).toHaveLength(0);
  });
});
