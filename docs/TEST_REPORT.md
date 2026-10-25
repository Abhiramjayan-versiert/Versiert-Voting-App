# V.app — Test report

Generated 2026-10-25T16:10:13.857Z by `npx tsx scripts/test-report.ts` from the result files of the most recent runs. Nothing in this table is hand-edited.

| Total | Passed | Failed | Not run |
|---|---|---|---|
| 108 | 108 | 0 | 0 |

Environment: Node v22.22.0, PostgreSQL 16 (local), Chromium (Playwright), production build (`next build` + `next start`) for E2E.

## Defects found during testing and fixed

| # | Defect | Found by | Fix | Status |
|---|---|---|---|---|
| 1 | CSV uploads parsed as empty sheets (Uint8Array passed where SheetJS expected a Buffer) | Unit test *caps rows* / *validates rows* | Convert to Buffer before parsing (`src/lib/imports.ts`) | Fixed, re-tested |
| 2 | React 19 auto-reset forms after Server Actions: the chosen file vanished between *Preview* and *Import*, and typed values were lost on validation errors | E2E *malicious spreadsheets* | Forms submit via `startTransition` without auto-reset; import buttons build `FormData` explicitly | Fixed, re-tested |
| 3 | Publishing hung when the college had administrators: notification insert on a second connection waited on the election row locked by the publish transaction | E2E *publish* step | Queue notifications inside the same transaction; `FOR NO KEY UPDATE`; 10 s `lock_timeout` on all connections; regression test added | Fixed, re-tested |
| 4 | Development CSP blocked React dev tooling (`eval`) | Admin page crawl | `'unsafe-eval'` only when `NODE_ENV !== production` (E2E asserts it's absent in production) | Fixed |
| 5 | Health page 500: app role lacked read access to `schema_migrations` | Console crawl | Migration `0005` grants `SELECT` | Fixed |

Test-only adjustments (not product defects): the E2E environment raises per-network rate limits (all traffic comes from one IP — the limiter correctly blocked it); the TOTP helper waits for an unused 30-second step (the server correctly rejects replayed codes); an E2E password containing "admin" was correctly rejected by the password policy.

## Results

| Suite | Test (expected outcome) | Actual | Status | Failure explanation | Reproduce | Remediation |
|---|---|---|---|---|---|---|
| Integration | least-privilege database role › the app role cannot read, write or delete raw ballots | Behaved as expected (72 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "the app role cannot read, write or delete raw ballots"` | — |
| Integration | least-privilege database role › accepted ballots are immutable even for the schema owner | Behaved as expected (27 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "accepted ballots are immutable even for the schema owner"` | — |
| Integration | least-privilege database role › the app role cannot create or escalate to Super Admin | Behaved as expected (3 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "the app role cannot create or escalate to Super Admin"` | — |
| Integration | tenant isolation (Row Level Security) › a college admin sees only their own college's data | Behaved as expected (72 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "a college admin sees only their own college's data"` | — |
| Integration | tenant isolation (Row Level Security) › cannot modify or create data in another college | Behaved as expected (43 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "cannot modify or create data in another college"` | — |
| Integration | tenant isolation (Row Level Security) › no context means no rows | Behaved as expected (23 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "no context means no rows"` | — |
| Integration | election management rules › structure is locked after activation and activation requires readiness | Behaved as expected (53 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "structure is locked after activation and activation requires readiness"` | — |
| Integration | election management rules › pause revokes voter sessions and blocks voting; resume allows only extension | Behaved as expected (36 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "pause revokes voter sessions and blocks voting; resume allows only extension"` | — |
| Integration | election management rules › candidate withdrawal only while paused, with a reason | Behaved as expected (28 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "candidate withdrawal only while paused, with a reason"` | — |
| Integration | results, integrity and publication › publishes only after close, with passing integrity, and results match accepted ballots | Behaved as expected (139 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "publishes only after close, with passing integrity, and results match accepted ballots"` | — |
| Integration | results, integrity and publication › publishing notifies assigned administrators without lock contention (regression) | Behaved as expected (44 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "publishing notifies assigned administrators without lock contention (regression)"` | — |
| Integration | results, integrity and publication › reports ties without breaking them | Behaved as expected (40 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "reports ties without breaking them"` | — |
| Integration | results, integrity and publication › audit chain verifies, and tampering is detected | Behaved as expected (11 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "audit chain verifies, and tampering is detected"` | — |
| Integration | Super Admin full election access › super-admin context can read and manage any college's election | Behaved as expected (46 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "super-admin context can read and manage any college's election"` | — |
| Integration | Super Admin full election access › delete_election removes an election with accepted ballots, and nothing is left behind | Behaved as expected (53 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "delete_election removes an election with accepted ballots, and nothing is left behind"` | — |
| Integration | Super Admin college and administrator management › delete_college removes the college, its elections and ballots, keeps admin accounts and the audit log | Behaved as expected (29 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "delete_college removes the college, its elections and ballots, keeps admin accounts and the audit log"` | — |
| Integration | Super Admin college and administrator management › only a Super Admin context can see and delete administrator accounts across colleges | Behaved as expected (33 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "only a Super Admin context can see and delete administrator accounts across colleges"` | — |
| Integration | retention and deletion lifecycle › refuses premature purge, then deletes personal data and keeps the public aggregate | Behaved as expected (150 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "refuses premature purge, then deletes personal data and keeps the public aggregate"` | — |
| Integration | retention and deletion lifecycle › removes the snapshot too when the policy doesn't keep public results | Behaved as expected (78 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "removes the snapshot too when the policy doesn't keep public results"` | — |
| Integration | retention and deletion lifecycle › lifecycle tick opens, closes and auto-publishes when approval isn't required | Behaved as expected (77 ms) | **PASS** | — | `npx vitest run tests/integration/security-lifecycle.test.ts -t "lifecycle tick opens, closes and auto-publishes when approval isn't required"` | — |
| Integration | one vote per voter per position (core rule) › accepts one Chairman vote, rejects a second, still allows Vice Chairman | Behaved as expected (91 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "accepts one Chairman vote, rejects a second, still allows Vice Chairman"` | — |
| Integration | one vote per voter per position (core rule) › mixed ballot: already-voted positions are skipped, new ones accepted | Behaved as expected (34 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "mixed ballot: already-voted positions are skipped, new ones accepted"` | — |
| Integration | one vote per voter per position (core rule) › 50 concurrent submissions (different keys, tabs, sessions) accept exactly one | Behaved as expected (482 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "50 concurrent submissions (different keys, tabs, sessions) accept exactly one"` | — |
| Integration | one vote per voter per position (core rule) › idempotent replay returns the same receipt and records nothing new | Behaved as expected (47 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "idempotent replay returns the same receipt and records nothing new"` | — |
| Integration | one vote per voter per position (core rule) › different voters each get their own vote | Behaved as expected (54 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "different voters each get their own vote"` | — |
| Integration | server-side ballot validation › rejects a candidate from another position or another election (tampered IDs) | Behaved as expected (66 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "rejects a candidate from another position or another election (tampered IDs)"` | — |
| Integration | server-side ballot validation › rejects invalid, expired and revoked sessions | Behaved as expected (25 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "rejects invalid, expired and revoked sessions"` | — |
| Integration | server-side ballot validation › a session for election A cannot vote in election B | Behaved as expected (39 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "a session for election A cannot vote in election B"` | — |
| Integration | server-side ballot validation › rejects when not open: scheduled, paused, closed, draft | Behaved as expected (83 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "rejects when not open: scheduled, paused, closed, draft"` | — |
| Integration | server-side ballot validation › enforces max selections, duplicates, abstention and require-all rules | Behaved as expected (55 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "enforces max selections, duplicates, abstention and require-all rules"` | — |
| Integration | server-side ballot validation › rejects withdrawn candidates and enforces position-specific eligibility | Behaved as expected (27 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "rejects withdrawn candidates and enforces position-specific eligibility"` | — |
| Integration | voter-verifiable secret ballots (verification codes) › a voter can look up exactly how their ballot was recorded with their code | Behaved as expected (32 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "a voter can look up exactly how their ballot was recorded with their code"` | — |
| Integration | voter-verifiable secret ballots (verification codes) › the code is stored only with the anonymous selections, never with the voter | Behaved as expected (25 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "the code is stored only with the anonymous selections, never with the voter"` | — |
| Integration | voter-verifiable secret ballots (verification codes) › ballots cast without a code still count; malformed codes are refused | Behaved as expected (30 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "ballots cast without a code still count; malformed codes are refused"` | — |
| Integration | voter-verifiable secret ballots (verification codes) › the anonymous ballot list is available only after publication | Behaved as expected (32 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "the anonymous ballot list is available only after publication"` | — |
| Integration | secret ballot storage › selections carry no voter reference or timestamp in a secret ballot | Behaved as expected (36 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "selections carry no voter reference or timestamp in a secret ballot"` | — |
| Integration | secret ballot storage › open ballots link choices to voters and expose them only via open_register | Behaved as expected (47 ms) | **PASS** | — | `npx vitest run tests/integration/voting.test.ts -t "open ballots link choices to voters and expose them only via open_register"` | — |
| Unit | TOTP (RFC 6238) › matches the RFC test vector | Behaved as expected (3 ms) | **PASS** | — | `npx vitest run tests/unit/crypto.test.ts -t "matches the RFC test vector"` | — |
| Unit | TOTP (RFC 6238) › accepts ±1 step and rejects others | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/crypto.test.ts -t "accepts ±1 step and rejects others"` | — |
| Unit | TOTP (RFC 6238) › base32 round-trips | Behaved as expected (0 ms) | **PASS** | — | `npx vitest run tests/unit/crypto.test.ts -t "base32 round-trips"` | — |
| Unit | secrets at rest › AES-GCM round-trips and detects tampering | Behaved as expected (5 ms) | **PASS** | — | `npx vitest run tests/unit/crypto.test.ts -t "AES-GCM round-trips and detects tampering"` | — |
| Unit | secrets at rest › rejects wrong key length | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/crypto.test.ts -t "rejects wrong key length"` | — |
| Unit | one-time codes › are 6 digits and well distributed | Behaved as expected (36 ms) | **PASS** | — | `npx vitest run tests/unit/crypto.test.ts -t "are 6 digits and well distributed"` | — |
| Unit | one-time codes › constant-time compare | Behaved as expected (0 ms) | **PASS** | — | `npx vitest run tests/unit/crypto.test.ts -t "constant-time compare"` | — |
| Unit | email normalisation › trims, lower-cases and NFKC-normalises | Behaved as expected (5 ms) | **PASS** | — | `npx vitest run tests/unit/email.test.ts -t "trims, lower-cases and NFKC-normalises"` | — |
| Unit | email normalisation › strips zero-width characters and mailto: | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/email.test.ts -t "strips zero-width characters and mailto:"` | — |
| Unit | email normalisation › keeps dots and +tags (college servers may treat them as distinct) | Behaved as expected (0 ms) | **PASS** | — | `npx vitest run tests/unit/email.test.ts -t "keeps dots and +tags (college servers may treat them as distinct)"` | — |
| Unit | email normalisation › rejects invalid input | Behaved as expected (2 ms) | **PASS** | — | `npx vitest run tests/unit/email.test.ts -t "rejects invalid input"` | — |
| Unit | email normalisation › normalises student IDs (case, spaces, full-width) | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/email.test.ts -t "normalises student IDs (case, spaces, full-width)"` | — |
| Unit | email normalisation › checks approved domains including subdomains | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/email.test.ts -t "checks approved domains including subdomains"` | — |
| Unit | spreadsheet import › guesses column mapping | Behaved as expected (3 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "guesses column mapping"` | — |
| Unit | spreadsheet import › validates rows: missing, invalid, duplicate, domain | Behaved as expected (8 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "validates rows: missing, invalid, duplicate, domain"` | — |
| Unit | spreadsheet import › reads xlsx and does not evaluate formulas | Behaved as expected (94 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "reads xlsx and does not evaluate formulas"` | — |
| Unit | spreadsheet import › rejects disguised and binary files | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "rejects disguised and binary files"` | — |
| Unit | spreadsheet import › caps rows | Behaved as expected (2 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "caps rows"` | — |
| Unit | export safety › neutralises formula injection | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "neutralises formula injection"` | — |
| Unit | export safety › produces RFC-4180 CSV with BOM | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "produces RFC-4180 CSV with BOM"` | — |
| Unit | export safety › builds a workbook with frozen, filtered headers | Behaved as expected (49 ms) | **PASS** | — | `npx vitest run tests/unit/imports-exports.test.ts -t "builds a workbook with frozen, filtered headers"` | — |
| Unit | lifecycle › computes the effective status independent of cron timing | Behaved as expected (2 ms) | **PASS** | — | `npx vitest run tests/unit/lifecycle.test.ts -t "computes the effective status independent of cron timing"` | — |
| Unit | lifecycle › accepts votes only when open | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/lifecycle.test.ts -t "accepts votes only when open"` | — |
| Unit | lifecycle › only drafts are structurally editable | Behaved as expected (0 ms) | **PASS** | — | `npx vitest run tests/unit/lifecycle.test.ts -t "only drafts are structurally editable"` | — |
| Unit | lifecycle › enforces the transition graph | Behaved as expected (0 ms) | **PASS** | — | `npx vitest run tests/unit/lifecycle.test.ts -t "enforces the transition graph"` | — |
| Unit | lifecycle › schedules retention deletion | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/lifecycle.test.ts -t "schedules retention deletion"` | — |
| Unit | lifecycle › validates schedules | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/lifecycle.test.ts -t "validates schedules"` | — |
| Unit | percentages › rounds to 2 decimals and handles zero | Behaved as expected (2 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "rounds to 2 decimals and handles zero"` | — |
| Unit | winner calculation › single seat clear winner | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "single seat clear winner"` | — |
| Unit | winner calculation › detects a tie for the only seat and never breaks it | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "detects a tie for the only seat and never breaks it"` | — |
| Unit | winner calculation › multi-seat with tie at the boundary | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "multi-seat with tie at the boundary"` | — |
| Unit | winner calculation › multi-seat without tie | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "multi-seat without tie"` | — |
| Unit | winner calculation › no votes at all | Behaved as expected (0 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "no votes at all"` | — |
| Unit | winner calculation › fewer non-zero candidates than seats are all winners | Behaved as expected (1 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "fewer non-zero candidates than seats are all winners"` | — |
| Unit | computeResults › counts accepted votes, abstentions, turnout; withdrawn candidates cannot win | Behaved as expected (2 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "counts accepted votes, abstentions, turnout; withdrawn candidates cannot win"` | — |
| Unit | computeResults › handles zero participation | Behaved as expected (10 ms) | **PASS** | — | `npx vitest run tests/unit/results.test.ts -t "handles zero participation"` | — |
| E2E workflow | 1–2. Developer creates a college and invites an administrator | Behaved as expected (6606 ms) | **PASS** | — | `npx playwright test 01-full-election.spec.ts:36` | — |
| E2E workflow | 3–7. Administrator builds the election and opens it | Behaved as expected (7046 ms) | **PASS** | — | `npx playwright test 01-full-election.spec.ts:62` | — |
| E2E workflow | 8–13. Students verify, vote once per position, duplicates rejected | Behaved as expected (8518 ms) | **PASS** | — | `npx playwright test 01-full-election.spec.ts:111` | — |
| E2E workflow | 14–17. Close, review, publish, export — results match accepted ballots | Behaved as expected (14257 ms) | **PASS** | — | `npx playwright test 01-full-election.spec.ts:199` | — |
| E2E workflow | 18. Retention cleanup deletes personal data and keeps the public aggregate | Behaved as expected (30088 ms) | **PASS** | — | `npx playwright test 01-full-election.spec.ts:278` | — |
| E2E security | unauthenticated users cannot reach the Super Admin console or college dashboards | Behaved as expected (1361 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:8` | — |
| E2E security | a password alone never reaches the Super Admin console (MFA enforced) | Behaved as expected (1105 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:15` | — |
| E2E security | a college administrator cannot access the Super Admin console | Behaved as expected (1172 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:25` | — |
| E2E security | a college administrator cannot access another college by changing URLs or API paths | Behaved as expected (2322 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:33` | — |
| E2E security | voting requires email verification; submissions without a session are refused | Behaved as expected (686 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:56` | — |
| E2E security | knowing a student's email and ID is not enough: the emailed code is required | Behaved as expected (1221 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:67` | — |
| E2E security | guessing student IDs is locked out per email | Behaved as expected (2511 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:89` | — |
| E2E security | tampered candidate IDs, cross-origin posts, replays and expired sessions | Behaved as expected (1471 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:103` | — |
| E2E security | unpublished results are not visible to voters or the public | Behaved as expected (1874 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:131` | — |
| E2E security | cron endpoints require the secret | Behaved as expected (63 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:144` | — |
| E2E security | malicious or disguised spreadsheets are rejected | Behaved as expected (2409 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:151` | — |
| E2E security | security headers are present | Behaved as expected (15 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:172` | — |
| E2E security | repeated wrong passwords lock the account | Behaved as expected (2773 ms) | **PASS** | — | `npx playwright test 02-security.spec.ts:182` | — |
| E2E responsive/PWA | developer console renders on phone and desktop | Behaved as expected (2262 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:47` | — |
| E2E responsive/PWA | PWA manifest and service worker are served | Behaved as expected (44 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:57` | — |
| E2E responsive/PWA | small-android › public and voter pages fit the screen | Behaved as expected (1605 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:23` | — |
| E2E responsive/PWA | small-android › college dashboard and navigation | Behaved as expected (1858 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:30` | — |
| E2E responsive/PWA | iphone-se › public and voter pages fit the screen | Behaved as expected (1865 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:23` | — |
| E2E responsive/PWA | iphone-se › college dashboard and navigation | Behaved as expected (2117 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:30` | — |
| E2E responsive/PWA | iphone-15 › public and voter pages fit the screen | Behaved as expected (1831 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:23` | — |
| E2E responsive/PWA | iphone-15 › college dashboard and navigation | Behaved as expected (1995 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:30` | — |
| E2E responsive/PWA | ipad-portrait › public and voter pages fit the screen | Behaved as expected (2933 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:23` | — |
| E2E responsive/PWA | ipad-portrait › college dashboard and navigation | Behaved as expected (1417 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:30` | — |
| E2E responsive/PWA | laptop › public and voter pages fit the screen | Behaved as expected (2176 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:23` | — |
| E2E responsive/PWA | laptop › college dashboard and navigation | Behaved as expected (1260 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:30` | — |
| E2E responsive/PWA | large-display › public and voter pages fit the screen | Behaved as expected (2324 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:23` | — |
| E2E responsive/PWA | large-display › college dashboard and navigation | Behaved as expected (1124 ms) | **PASS** | — | `npx playwright test 03-responsive.spec.ts:30` | — |
| E2E workflow | Super Admin can open, run, view results of, export and create elections in any college | Behaved as expected (21358 ms) | **PASS** | — | `npx playwright test 04-super-admin.spec.ts:7` | — |
| E2E workflow | college admins cannot use Super Admin deletion | Behaved as expected (1133 ms) | **PASS** | — | `npx playwright test 04-super-admin.spec.ts:67` | — |
| E2E workflow | Super Admin can permanently delete a running election | Behaved as expected (25307 ms) | **PASS** | — | `npx playwright test 04-super-admin.spec.ts:74` | — |

## Manual checks performed in the build environment

| Check | Expected | Actual | Status |
|---|---|---|---|
| Restart persistence | Votes, elections, submissions and audit entries survive stopping and restarting both the app server and PostgreSQL | Row counts before/after: 89|33|4|16 → 89|33|4|16 (participations|submissions|elections|audit); /api/health ok (2026-10-23T20:41:04Z (recorded)) | **PASS** |
| Responsive screenshots | Layouts adapt at 360–1920 px with no horizontal scroll | Asserted automatically in *E2E responsive*; screenshots in `test-results/screens/` | see E2E rows |

## Coverage of the mandatory security scenarios (spec §18)

| Scenario | Covered by |
|---|---|
| Unauthorised user → Super Admin dashboard | E2E security: unauthenticated users…; password alone never reaches…; college administrator cannot access the Super Admin console |
| College admin → another college's data | E2E security: …changing URLs or API paths; Integration: tenant isolation (3 tests) |
| Vote without matching email + student ID | E2E security: voting requires email verification…; E2E workflow step 8 |
| Unpublished results page | E2E security: unpublished results are not visible… |
| Changing a candidate ID in a request | E2E security: tampered candidate IDs…; Integration: rejects a candidate from another position or election |
| Duplicate and simultaneous submissions | Integration: 50 concurrent submissions…; E2E workflow steps 10–11 |
| Replayed requests | Integration: idempotent replay…; E2E security: …replays… |
| Expired voting sessions | Integration: rejects invalid, expired and revoked sessions; E2E security: …expired sessions |
| Malicious spreadsheet files | E2E security: malicious or disguised spreadsheets…; Unit: rejects disguised and binary files |
| Unauthorised result publication | Integration: cannot modify or create data in another college (`E.publish` across colleges); publish refused before close / with open incidents |
| Unauthorised ballot access | Integration: the app role cannot read, write or delete raw ballots |
| Editing an accepted ballot | Integration: accepted ballots are immutable even for the schema owner |
| Unauthorised data deletion | Integration: refuses premature purge…; E2E security: college admin → `/platform/jobs` forbidden |
