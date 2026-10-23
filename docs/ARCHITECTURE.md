# Architecture (Phase 1 design, as built)

```
Browser (PWA) ──HTTPS──▶ Vercel: Next.js 16 App Router (Node runtime)
                           ├─ Server Components (pages)       ─┐
                           ├─ Server Actions (mutations)       ├─▶ src/lib/* (domain services)
                           ├─ Route handlers: /e/*/submit, /api/exports, /api/cron/*, /media/*
                           └─ Cron (vercel.json) ──Bearer──▶ /api/cron/tick, /api/cron/retention
src/lib/* ──postgres.js (role vapp_app, RLS context per tx)──▶ PostgreSQL
                                                               ├─ public: tenant tables (RLS)
                                                               ├─ app: context + helper functions
                                                               └─ ballot: secret selections + SECURITY DEFINER functions
Email: Resend HTTP API (codes sent immediately; other mail queued in `notifications`)
```

## Module boundaries

| Concern | Module |
|---|---|
| Presentation | `src/app/**`, `src/components/**` |
| Authentication & authorisation | `src/lib/auth.ts`, `src/lib/admin-tokens.ts`, `src/app/admin/actions.ts` |
| Election management | `src/lib/elections.ts`, `src/app/college/actions.ts` |
| Voter eligibility & verification | `src/lib/voter.ts`, `src/lib/email-normalize.ts`, `src/app/e/actions.ts` |
| Vote submission & integrity | `ballot.cast_votes` (SQL), `src/app/e/[slug]/submit/route.ts` |
| Result calculation & publication | `src/lib/results.ts` (pure), `ballot.tally`, `E.publish/integrityReport` |
| Imports / exports | `src/lib/imports.ts`, `src/lib/exports.ts`, `src/app/api/exports/**` |
| Audit | `src/lib/audit.ts`, `app.audit_chain` trigger |
| Retention & jobs | `src/lib/jobs.ts`, `ballot.purge_election`, `/api/cron/*` |
| Platform configuration | `src/lib/config.ts` (`system_config` table) |

## Data model

`users`, `sessions`, `auth_tokens` · `colleges`, `college_admins` · `elections`, `positions`, `candidates` · `voters`, `voter_imports`, `import_errors` · `otp_challenges`, `voter_sessions` · `vote_submissions`, `participations`, `ballot.selections` · `result_snapshots`, `publication_history` · `audit_events`, `security_events` · `notifications`, `dev_mailbox` · `rate_limits`, `system_config`, `job_runs`, `cleanup_jobs`, `deletion_receipts`. See `db/migrations/0001_core.sql`.

## Permissions model

| Capability | Super Admin | College admin | Voter | Public |
|---|---|---|---|---|
| Colleges / admins / platform config | ✓ | — | — | — |
| Audit & security (all) | ✓ | own college | — | — |
| Elections, voters, positions, candidates | read (aggregate) | own colleges | — | — |
| Activate / pause / close / publish | — | own colleges | — | — |
| Live tallies | — | own, if enabled | — | — |
| Cast ballot | — | — | verified, eligible | — |
| Individual secret-ballot choices | **nobody** | **nobody** | — | — |
| Published aggregate results | ✓ | ✓ | ✓ | ✓ (with link) |
| Force early deletion | ✓ (typed confirmation) | — | — | — |

## Development checklist (status)

- [x] Schema, migrations, roles, RLS, ballot functions
- [x] Auth (Argon2, TOTP MFA, sessions, invites, resets, lockout, rate limits)
- [x] Super Admin console (overview, colleges, admins, elections, security, audit, jobs/cleanup, health/backups, config, test mailbox)
- [x] College admin dashboard, 6-step election wizard, imports, positions, candidates, rules, review/activate, preview, monitor, results/publish, exports, activity
- [x] Student flow (entry, verify, ballot, review, confirm, receipt, partial ballots)
- [x] Public results, receipt check, help, privacy, admin guide
- [x] Cron lifecycle + retention with receipts
- [x] PWA (manifest, icons, service worker, offline page)
- [x] Unit, integration, E2E, security and responsive tests
- [ ] Tauri desktop installer (not possible in build environment — documented)
