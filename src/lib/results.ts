// Pure result calculation — no I/O, fully unit-tested.

export type PositionIn = { id: string; name: string; sort_order: number; max_selections: number };
export type CandidateIn = { id: string; position_id: string; full_name: string; status: string; sort_order?: number };
export type TallyRow = { position_id: string; candidate_id: string | null; votes: number };

export type CandidateResult = {
  id: string; name: string; votes: number; pct: number; outcome: "winner" | "tied" | null; status: string;
};
export type PositionResult = {
  id: string; name: string; seats: number;
  eligible: number; participants: number; turnoutPct: number;
  abstentions: number; candidateVotes: number;
  status: "winner" | "tie" | "no_votes";
  candidates: CandidateResult[];
};
export type ElectionResult = {
  eligibleVoters: number; participatingVoters: number; turnoutPct: number;
  positions: PositionResult[];
};

/** Percentage with 2 decimals; 0 when the denominator is 0. */
export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part * 10000) / whole) / 100;
}

/** Decide winners for `seats` seats. Ties at the seat boundary are reported, never broken. */
export function decide(votes: { id: string; votes: number }[], seats: number) {
  const sorted = [...votes].sort((a, b) => b.votes - a.votes);
  const outcome = new Map<string, "winner" | "tied" | null>();
  if (sorted.length === 0 || sorted.every((c) => c.votes === 0)) {
    sorted.forEach((c) => outcome.set(c.id, null));
    return { status: "no_votes" as const, outcome };
  }
  const nonZero = sorted.filter((c) => c.votes > 0);
  if (nonZero.length <= seats) {
    sorted.forEach((c) => outcome.set(c.id, c.votes > 0 ? "winner" : null));
    return { status: "winner" as const, outcome };
  }
  const cutoff = sorted[seats - 1].votes;
  const above = sorted.filter((c) => c.votes > cutoff);
  const atCutoff = sorted.filter((c) => c.votes === cutoff);
  const tie = above.length + atCutoff.length > seats;
  sorted.forEach((c) => {
    if (c.votes > cutoff) outcome.set(c.id, "winner");
    else if (c.votes === cutoff) outcome.set(c.id, tie ? "tied" : "winner");
    else outcome.set(c.id, null);
  });
  return { status: tie ? ("tie" as const) : ("winner" as const), outcome };
}

export function computeResults(input: {
  positions: PositionIn[];
  candidates: CandidateIn[];
  tally: TallyRow[];
  participantsByPosition: Record<string, number>;
  eligibleByPosition: Record<string, number>;
  eligibleVoters: number;
  participatingVoters: number;
}): ElectionResult {
  const positions = [...input.positions].sort((a, b) => a.sort_order - b.sort_order).map((p) => {
    const rows = input.tally.filter((t) => t.position_id === p.id);
    const abstentions = rows.filter((r) => r.candidate_id === null).reduce((s, r) => s + Number(r.votes), 0);
    const cands = input.candidates
      .filter((c) => c.position_id === p.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const votesOf = (id: string) => Number(rows.find((r) => r.candidate_id === id)?.votes ?? 0);
    const candidateVotes = cands.reduce((s, c) => s + votesOf(c.id), 0);
    // Only active candidates can win; withdrawn/disqualified keep their (zero) counts for transparency.
    const contenders = cands.filter((c) => c.status === "active").map((c) => ({ id: c.id, votes: votesOf(c.id) }));
    const d = decide(contenders, p.max_selections);
    const eligible = input.eligibleByPosition[p.id] ?? 0;
    const participants = input.participantsByPosition[p.id] ?? 0;
    return {
      id: p.id, name: p.name, seats: p.max_selections, eligible, participants,
      turnoutPct: pct(participants, eligible), abstentions, candidateVotes, status: d.status,
      candidates: cands
        .map((c) => ({ id: c.id, name: c.full_name, status: c.status, votes: votesOf(c.id), pct: pct(votesOf(c.id), candidateVotes), outcome: d.outcome.get(c.id) ?? null }))
        .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)),
    } satisfies PositionResult;
  });
  return {
    eligibleVoters: input.eligibleVoters,
    participatingVoters: input.participatingVoters,
    turnoutPct: pct(input.participatingVoters, input.eligibleVoters),
    positions,
  };
}
