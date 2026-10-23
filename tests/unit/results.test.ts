import { describe, it, expect } from "vitest";
import { pct, decide, computeResults } from "@/lib/results";

describe("percentages", () => {
  it("rounds to 2 decimals and handles zero", () => {
    expect(pct(1, 3)).toBe(33.33);
    expect(pct(2, 3)).toBe(66.67);
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 5)).toBe(100);
  });
});

describe("winner calculation", () => {
  it("single seat clear winner", () => {
    const d = decide([{ id: "a", votes: 5 }, { id: "b", votes: 3 }], 1);
    expect(d.status).toBe("winner");
    expect(d.outcome.get("a")).toBe("winner");
    expect(d.outcome.get("b")).toBeNull();
  });
  it("detects a tie for the only seat and never breaks it", () => {
    const d = decide([{ id: "a", votes: 4 }, { id: "b", votes: 4 }, { id: "c", votes: 1 }], 1);
    expect(d.status).toBe("tie");
    expect(d.outcome.get("a")).toBe("tied");
    expect(d.outcome.get("b")).toBe("tied");
    expect(d.outcome.get("c")).toBeNull();
  });
  it("multi-seat with tie at the boundary", () => {
    const d = decide([{ id: "a", votes: 9 }, { id: "b", votes: 5 }, { id: "c", votes: 5 }, { id: "d", votes: 1 }], 2);
    expect(d.status).toBe("tie");
    expect(d.outcome.get("a")).toBe("winner");
    expect(d.outcome.get("b")).toBe("tied");
    expect(d.outcome.get("c")).toBe("tied");
  });
  it("multi-seat without tie", () => {
    const d = decide([{ id: "a", votes: 9 }, { id: "b", votes: 6 }, { id: "c", votes: 5 }], 2);
    expect(d.status).toBe("winner");
    expect([...d.outcome].filter(([, v]) => v === "winner").map(([k]) => k).sort()).toEqual(["a", "b"]);
  });
  it("no votes at all", () => {
    expect(decide([{ id: "a", votes: 0 }, { id: "b", votes: 0 }], 1).status).toBe("no_votes");
    expect(decide([], 1).status).toBe("no_votes");
  });
  it("fewer non-zero candidates than seats are all winners", () => {
    const d = decide([{ id: "a", votes: 3 }, { id: "b", votes: 0 }], 2);
    expect(d.status).toBe("winner");
    expect(d.outcome.get("a")).toBe("winner");
    expect(d.outcome.get("b")).toBeNull();
  });
});

describe("computeResults", () => {
  const positions = [{ id: "p1", name: "Chair", sort_order: 1, max_selections: 1 }, { id: "p2", name: "Treasurer", sort_order: 2, max_selections: 1 }];
  const candidates = [
    { id: "c1", position_id: "p1", full_name: "A", status: "active" }, { id: "c2", position_id: "p1", full_name: "B", status: "active" },
    { id: "c3", position_id: "p2", full_name: "C", status: "active" }, { id: "c4", position_id: "p2", full_name: "D", status: "withdrawn" },
  ];
  it("counts accepted votes, abstentions, turnout; withdrawn candidates cannot win", () => {
    const r = computeResults({
      positions, candidates,
      tally: [{ position_id: "p1", candidate_id: "c1", votes: 6 }, { position_id: "p1", candidate_id: "c2", votes: 2 }, { position_id: "p1", candidate_id: null, votes: 2 },
              { position_id: "p2", candidate_id: "c4", votes: 3 }, { position_id: "p2", candidate_id: "c3", votes: 1 }],
      participantsByPosition: { p1: 10, p2: 4 }, eligibleByPosition: { p1: 20, p2: 20 }, eligibleVoters: 20, participatingVoters: 10,
    });
    expect(r.turnoutPct).toBe(50);
    const [chair, tre] = r.positions;
    expect(chair.abstentions).toBe(2);
    expect(chair.candidateVotes).toBe(8);
    expect(chair.candidates[0]).toMatchObject({ name: "A", votes: 6, pct: 75, outcome: "winner" });
    expect(chair.turnoutPct).toBe(50);
    expect(tre.candidates.find((c) => c.name === "D")?.outcome).toBeNull();
    expect(tre.candidates.find((c) => c.name === "C")?.outcome).toBe("winner");
  });
  it("handles zero participation", () => {
    const r = computeResults({ positions, candidates, tally: [], participantsByPosition: {}, eligibleByPosition: { p1: 5, p2: 5 }, eligibleVoters: 5, participatingVoters: 0 });
    expect(r.turnoutPct).toBe(0);
    expect(r.positions.every((p) => p.status === "no_votes")).toBe(true);
  });
});
