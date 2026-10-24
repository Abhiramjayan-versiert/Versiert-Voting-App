import postgres from "postgres";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
let owner: postgres.Sql | null = null;
let app: postgres.Sql | null = null;
/** Schema-owner connection (fixtures only). */
export const ownerDb = () => (owner ??= postgres(process.env.DATABASE_OWNER_URL!, { max: 4, onnotice: () => {} }));
/** Least-privilege application role — the same one the app uses at runtime. */
export const appDb = () => (app ??= postgres(process.env.DATABASE_URL!, { max: 25, onnotice: () => {}, prepare: false }));
export async function closeDbs() { await owner?.end(); await app?.end(); owner = app = null; }

export type Fixture = Awaited<ReturnType<typeof makeElection>>;

/** Builds a college + election with positions/candidates/voters directly (owner role). */
export async function makeElection(o: {
  positions?: { name: string; cands: number; seats?: number; groups?: string[] }[]; voters?: number; status?: string;
  startH?: number; endH?: number; abstain?: boolean; requireAll?: boolean; secret?: boolean; groups?: string[]; retentionDays?: number; keepPublic?: boolean;
} = {}) {
  const db = ownerDb();
  const code = "T" + randomBytes(4).toString("hex").toUpperCase();
  const [c] = await db`insert into colleges (code, name, email_domains) values (${code}, ${"Test College " + code}, ${["t.test"]}) returning id`;
  const [e] = await db`insert into elections (college_id, slug, public_ref, event_name, title, starts_at, ends_at, status, allow_abstain, require_all_positions, secret_ballot, retention_days, keep_public_results)
    values (${c.id}, ${"t-" + code.toLowerCase()}, ${"E-" + randomBytes(5).toString("hex").toUpperCase()}, 'Test Event', 'Test Election',
            now() + make_interval(hours => ${o.startH ?? -1}), now() + make_interval(hours => ${o.endH ?? 5}), ${o.status ?? "open"},
            ${o.abstain ?? false}, ${o.requireAll ?? false}, ${o.secret ?? true}, ${o.retentionDays ?? 30}, ${o.keepPublic ?? true}) returning *`;
  const positions: { id: string; name: string; cands: string[] }[] = [];
  for (const [i, p] of (o.positions ?? [{ name: "Chairman", cands: 3 }, { name: "Vice Chairman", cands: 2 }]).entries()) {
    const [pr] = await db`insert into positions (election_id, college_id, name, sort_order, max_selections, eligible_groups) values (${e.id}, ${c.id}, ${p.name}, ${i}, ${p.seats ?? 1}, ${p.groups ?? null}) returning id`;
    const cands: string[] = [];
    for (let j = 0; j < p.cands; j++) {
      const [cd] = await db`insert into candidates (position_id, election_id, college_id, full_name, sort_order) values (${pr.id}, ${e.id}, ${c.id}, ${`${p.name} Candidate ${j + 1}`}, ${j}) returning id`;
      cands.push(cd.id);
    }
    positions.push({ id: pr.id, name: p.name, cands });
  }
  const voters: string[] = [];
  for (let i = 0; i < (o.voters ?? 5); i++) {
    const [v] = await db`insert into voters (election_id, college_id, email, student_id, voter_group) values (${e.id}, ${c.id}, ${`s${i}@t.test`}, ${`SID${i}`}, ${o.groups?.[i % o.groups.length] ?? null}) returning id`;
    voters.push(v.id);
  }
  return { collegeId: c.id as string, election: e, electionId: e.id as string, positions, voters };
}

/** Creates a verified voter session (as the OTP flow would) and returns its token hash. */
export async function session(f: Fixture, voterIdx: number, minutes = 10) {
  const token = randomBytes(24).toString("base64url");
  await ownerDb()`insert into voter_sessions (token_hash, voter_id, election_id, expires_at) values (${sha(token)}, ${f.voters[voterIdx]}, ${f.electionId}, now() + make_interval(mins => ${minutes}))`;
  return sha(token);
}

/** Calls the real ballot function as the app role. */
export async function cast(sessionHash: string, choices: { position_id: string; candidate_ids: string[] }[], idem = randomUUID()) {
  const [r] = await appDb()`select ballot.cast_votes(${sessionHash}, ${idem}, ${appDb().json(choices as never)}) as r`;
  return r.r as { receipt: string | null; replayed: boolean; positions: { position_id: string; status: string }[] };
}

/** Casts with a vote verification code, exactly as the submit route does (transaction-local setting). */
export async function castWithCode(sessionHash: string, choices: { position_id: string; candidate_ids: string[] }[], code: string, idem = randomUUID()) {
  const [r] = await appDb().begin(async (tx) => {
    await tx`select set_config('ballot.check_code', ${code}, true)`;
    return tx`select ballot.cast_votes(${sessionHash}, ${idem}, ${tx.json(choices as never)}) as r`;
  });
  return r.r as { receipt: string | null; replayed: boolean; positions: { position_id: string; status: string }[] };
}

export async function castError(sessionHash: string, choices: unknown, idem = randomUUID()) {
  try { await appDb()`select ballot.cast_votes(${sessionHash}, ${idem}, ${appDb().json(choices as never)})`; return "NO_ERROR"; }
  catch (e) { return (e as Error).message; }
}

export async function tally(electionId: string) {
  const rows = await ownerDb()`select position_id, candidate_id, votes::int from ballot.tally(${electionId})`;
  return rows as unknown as { position_id: string; candidate_id: string | null; votes: number }[];
}
