# V.app — Voting Integrity Model

This document states exactly how V.app enforces "one valid vote per eligible voter per position", how secret ballots are stored, how results are computed, and how data is deleted. Every claim below is backed by code in `db/migrations/` and by automated tests in `tests/`.

---

## 1. Actors and trust boundaries

| Layer | Trust | Notes |
|---|---|---|
| Browser (student / admin) | Untrusted | All checks repeated on the server and in the database. |
| Next.js server (`vapp_app` DB role) | Partially trusted | Authenticates users, applies RLS context. **Cannot read or write ballot tables directly.** |
| PostgreSQL functions in schema `ballot` (`SECURITY DEFINER`, owner) | Trusted core | The only code that writes participation and ballot rows, and the only code that can read them (as aggregates). |
| Schema owner / DBA | Fully trusted | Can bypass everything. Protect this credential; it is never deployed to Vercel. |

## 2. Tables involved

```
voters             (id, election_id, email, voter_group, …)                 ← eligibility registry
voter_sessions     (token_hash, voter_id, election_id, expires_at, revoked_at)
vote_submissions   (voter_id, idempotency_key, receipt_code, result)        ← one row per accepted submit
participations     (election_id, voter_id, position_id, submission_id)      ← WHO voted for WHICH POSITION
ballot.selections  (id uuid random, election_id, position_id, candidate_id, voter_ref NULL)
                                                                             ← WHAT was chosen — no voter, no time
```

`participations` and `ballot.selections` share **no column that identifies a voter or a submission**. `ballot.selections` has no timestamp and uses random UUIDv4 keys.

## 3. Database constraints (exact)

| Rule | Enforcement |
|---|---|
| One accepted vote per voter per position | `participations_one_vote_per_position UNIQUE (election_id, voter_id, position_id)` |
| Position belongs to election | `positions UNIQUE (id, election_id)` + `participations FOREIGN KEY (position_id, election_id) REFERENCES positions(id, election_id)` |
| Candidate belongs to position & election | `candidates FOREIGN KEY (position_id, election_id) REFERENCES positions(id, election_id)` + check inside `ballot.cast_votes` |
| Voter unique within an election | `voters UNIQUE (election_id, email)` with `CHECK (email = lower(btrim(email)))` |
| Idempotent submission | `vote_submissions UNIQUE (voter_id, idempotency_key)` |
| Accepted ballots immutable | `BEFORE UPDATE OR DELETE` triggers on `ballot.selections` and `participations` raise `accepted ballots are immutable` (only the retention purge, which sets a transaction-local flag inside a definer function, can delete) |
| App cannot touch ballots | `REVOKE ALL ON ballot.selections FROM vapp_app`; only `EXECUTE` on `cast_votes`, `tally`, `open_register`, `purge_election`, `purge_leftovers` |
| App cannot write participation | `vapp_app` has `SELECT` only on `participations` and `vote_submissions` |
| Super Admin can't be created by the app | Trigger `users_guard_super` rejects `role='super_admin'` inserts/updates from `vapp_app` |
| Audit log append-only | Trigger rejects `UPDATE/DELETE`; `vapp_app` has `SELECT, INSERT` only; hash chain (`prev_hash`, `hash`) verified by `app.verify_audit_chain()` |
| Published snapshots immutable | Triggers reject `UPDATE`, and `DELETE` outside the purge |

## 4. Casting a ballot — `ballot.cast_votes(session_hash, idempotency_key, choices)`

Everything runs in **one transaction**:

1. Validate input shape (non-empty array, ≤100 items, key length).
2. Look up the voter session by **SHA-256 of the session token** (the app never passes a voter ID). Reject if missing, expired or revoked → `SESSION_INVALID`.
3. `SELECT … FROM elections … FOR SHARE` — blocks a concurrent pause/close until this transaction finishes.
4. Confirm the voter belongs to the session's election → `NOT_ELIGIBLE`.
5. `pg_advisory_xact_lock(hash(voter_id))` — serialises concurrent submits from the same voter (tabs, retries, double-clicks).
6. If `(voter_id, idempotency_key)` exists → return the stored result with `replayed: true`. **Nothing is written.**
7. Check the election is accepting votes (`status IN (scheduled, open) AND now() ∈ [starts_at, ends_at)`) → `ELECTION_NOT_OPEN`. This does not depend on the cron job.
8. **Validate the whole ballot before writing anything**: each position belongs to the election, appears once, voter's group is eligible, candidates are active members of that position, count ≤ `max_selections`, no duplicates, abstention allowed, require-all rule.
9. Insert the `vote_submissions` row (receipt code generated from `gen_random_bytes`).
10. For each position: `INSERT INTO participations … ON CONFLICT ON CONSTRAINT participations_one_vote_per_position DO NOTHING RETURNING id`.
    - Inserted → write the selection row(s) to `ballot.selections` → status `accepted`.
    - Conflict → status `already_voted`; **no selection is written**; the earlier ballot is untouched.
11. If nothing was accepted, the submission row is removed and no receipt is issued.
12. Commit. The API responds only after commit.

### Concurrency

Two simultaneous submissions for the same voter and position are serialised by the advisory lock, and even without it the unique constraint guarantees at most one `participations` row; `ON CONFLICT DO NOTHING` waits for the competing transaction and then skips. Tested with 50 parallel submissions across 5 sessions: exactly 1 accepted (`tests/integration/voting.test.ts`).

### Duplicate policy

| Situation | Outcome |
|---|---|
| Same voter, same position again (any candidate, any tab, any session) | Rejected as `already_voted`; first committed ballot stands; `duplicate_vote_attempt` security event (info) |
| Same request retried (same idempotency key) | Same receipt returned; nothing new recorded |
| Mixed ballot (some positions already voted) | New positions accepted, old ones reported as already voted |
| Tampered position/candidate IDs | Whole ballot rejected, nothing written, `invalid_ballot_rejected` security event |
| Suspected impersonation (someone used a student's email + ID) | Administrator records an incident → publication blocked until resolved with a written note |

V.app **never invalidates an accepted ballot because of a later duplicate attempt** — otherwise an attacker who knows a student's email could cancel that student's vote.

## 5. Voter verification (email + student ID)

No email is sent to voters. A student proves eligibility with two values that must both match the election's voter list:

1. **College email** — normalised (trim, NFKC, lower-case, zero-width characters removed; dots and `+tags` kept).
2. **Student ID** — normalised (NFKC, upper-case, all whitespace removed). Required for every voter; unique per election (`voters_election_student_id_uq`). Imports reject rows with a missing, too-short (< 3 chars) or duplicate ID.

The comparison uses keyed HMACs in constant time, and the error message is identical for an unknown email and a wrong ID, so the form can't be used to discover who is on the list.

Brute-force protection: at most `otp_max_attempts` (default **5**) attempts per email per election per hour — after that even the correct ID is refused until the window passes — and `rate_otp_per_ip_per_hour` (default 30) attempts per network. Lockouts are recorded as security events.

On success a 30-minute voter session is created (only the token's SHA-256 is stored; cookie `HttpOnly`, `SameSite=Strict`, path-scoped to `/e/<slug>`, `Secure` in production).

**Limitation — read this.** Anyone who knows **both** a student's college email and student ID can vote as that student. Student IDs often appear on ID cards, attendance sheets and group chats, so this is weaker than an emailed one-time code or institutional login. Mitigations: keep the voter list private, ask students to keep their ID private during the election, watch *Duplicate attempts blocked* and lockout events, and let students report suspected misuse (admins record an incident, which blocks publication until resolved). For higher-assurance elections, use emailed codes or the college's SSO.

## 6. Secret-ballot privacy guarantees

**Guaranteed by schema and grants:**
- No column links a selection to a voter, a submission, a session or a time.
- The application role cannot `SELECT` from `ballot.selections`; it can only call `ballot.tally()`, which returns `(position_id, candidate_id, count)`.
- No screen, export, log, email or receipt contains a voter's choice. Audit details are scrubbed of keys like `candidate_ids`, `code`, `token`, `password`.
- IP addresses are stored only as keyed HMACs.

**Residual correlation risks (honest list):**
1. **Physical row order.** A person with direct database-server access (schema owner / DBA) could compare the physical order of rows in `ballot.selections` with `participations.created_at`. The app role cannot do this. Mitigation: protect the owner credential; for stronger guarantees use a cryptographic protocol (mix-nets / homomorphic tallying) with independent review.
2. **Small numbers.** If one person voted for a position, totals reveal their choice. Live tallies during voting can reveal the most recent voter's choice if an admin watches turnout and tallies change together. Live tallies are configurable per election and admins are warned.
3. **Open ballots.** If an election is configured as an open ballot (`secret_ballot = false`, platform feature flag), `voter_ref` is populated and choices are exportable. Voters are shown a prominent notice before voting.
4. **Backups** contain whatever existed when the backup was taken.

V.app does **not** claim mathematically guaranteed anonymity or end-to-end verifiability.

## 7. Results

- `ballot.tally(election)` counts rows in `ballot.selections` grouped by position and candidate. Only accepted ballots exist in that table — rejected and duplicate attempts never reach it.
- Percentages = candidate votes ÷ valid candidate votes for that position, rounded to 2 decimals. Abstentions are reported separately and excluded from percentages. Turnout = participants ÷ eligible voters for that position (respecting group eligibility).
- Winners: top `max_selections` active candidates by votes. If candidates tie at the seat boundary the position status is `tie` and **no tie-break is applied**. Positions with zero votes report `no_votes`. Withdrawn/disqualified candidates keep their counts for transparency but cannot win.
- Integrity checks before publication (all must pass): ballot marks match participation per position; every vote references a valid candidate of its position; every participation is by an eligible voter; no duplicate participation; audit hash chain intact; no unresolved incidents.
- Publication writes an immutable JSON snapshot with its SHA-256 fingerprint shown on the public page. Unpublishing (optional per election) is allowed only during a 24-hour correction window and is recorded in `publication_history`.

## 8. Lifecycle & deletion

`draft → scheduled → open ⇄ paused → closed/results_pending → published → retention → deleted`

- Opening/closing is enforced at vote time from timestamps; the cron job only records status transitions.
- After activation, positions, candidates, rules and the voter list are locked. Emergency changes require **pause** (ends all voter sessions) and a written reason; only adding voters and withdrawing/disqualifying candidates are permitted; votes already cast are never altered.
- On publication: `purge_after = published_at + retention_days`; a `cleanup_jobs` row is scheduled; admins are emailed `pre_deletion_notice_days` before.
- `ballot.purge_election()` refuses unless the election is in `retention` and `purge_after` has passed (or a Super Admin forces it with typed confirmation). It deletes ballot selections, participation, submissions, sessions, OTP challenges, voters, imports, import errors, notifications, candidates (incl. photos), positions and the banner; anonymises related security events; and keeps the aggregate snapshot only if the election's policy says so.
- `ballot.purge_leftovers()` verifies zero remaining rows; a `deletion_receipts` row records counts and verification without personal data.
- Uploaded spreadsheets are never stored (parsed in memory), so there are no files to delete. Images are stored in Postgres and deleted with their rows.
- **Backups are separate.** Deleting rows does not remove them from provider backups; they expire on the provider's schedule (see `docs/OPERATIONS.md`).

## 9. Where this is tested

| Property | Test |
|---|---|
| One vote per position; other positions still allowed | `voting.test.ts` › core rule |
| 50 concurrent submissions → 1 accepted | `voting.test.ts` |
| Idempotent replay (sequential and concurrent) | `voting.test.ts`, `02-security.spec.ts` |
| Email + student ID required; wrong ID rejected; per-email lockout | `02-security.spec.ts`, `01-full-election.spec.ts` |
| Tampered IDs, cross-election sessions, expired/revoked sessions | `voting.test.ts`, `02-security.spec.ts` |
| App role cannot read/write ballots; immutability; super-admin guard | `security-lifecycle.test.ts` |
| Tenant isolation (RLS) | `security-lifecycle.test.ts`, `02-security.spec.ts` |
| Results equal accepted ballots; ties; snapshot immutability | `security-lifecycle.test.ts`, `01-full-election.spec.ts` |
| Audit tamper detection | `security-lifecycle.test.ts` |
| Retention purge preconditions, verification, receipts | `security-lifecycle.test.ts`, `01-full-election.spec.ts` |
