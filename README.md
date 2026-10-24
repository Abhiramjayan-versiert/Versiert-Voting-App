# V.app

**Your campus. Your choice.** Secure, private digital elections for colleges, student unions, clubs and campus associations.

V.app is a full-stack Next.js + PostgreSQL application with three roles — **Developer / Super Admin**, **College Election Administrator** and **Student / Voter** — real database-backed voting, row-level tenant isolation, secret-ballot storage, hash-chained audit logging, Excel/CSV import and export, scheduled data deletion, and an installable PWA.

> Detailed references: [Voting integrity model](docs/VOTING_INTEGRITY.md) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Operations, backup & recovery](docs/OPERATIONS.md) · [Security checklist & limitations](docs/SECURITY.md) · [Test report](docs/TEST_REPORT.md)

---

## 1. Product overview

| Role | Can | Cannot |
|---|---|---|
| **Super Admin** (platform owner, provisioned by CLI only, MFA mandatory) | Create/suspend colleges; invite, assign, suspend, revoke administrators; platform config (maintenance, retention, auth, rate limits, features); monitor health, jobs, imports, cleanup; review security events and the audit log; force early deletion | See how any individual voted |
| **College admin** (invited, optional/required MFA) | Create elections; import voter lists; manage positions/candidates; set rules; activate, pause, resume, close; monitor turnout; review integrity; publish results; export reports | See other colleges; edit/delete accepted ballots; see secret-ballot choices |
| **Student** (no account; college email + student ID) | Verify identity, vote once per eligible position, skip positions and return later, get a receipt code, view published results | Vote twice for a position; vote without matching email + student ID; see results before publication |

## 2. Technology stack

Next.js 16 (App Router, Server Actions, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 14+ (tested on 16) via `postgres` · Zod · Argon2id (`@node-rs/argon2`) · RFC 6238 TOTP (built-in) · ExcelJS (exports) · SheetJS 0.20.3 via `@e965/xlsx` (imports) · Vitest · Playwright · Resend (optional email) · optional Cloudflare Turnstile · Vercel (hosting + Cron).

Authentication is built in rather than Supabase Auth so it runs on any PostgreSQL (Supabase, Neon, RDS, self-hosted) and keeps privileged logic server-side.

## 3. Prerequisites

- Node.js **20.9+** (developed on 22) and npm
- PostgreSQL **14+** with a role that can `CREATE ROLE` once (Supabase/Neon `postgres` owner is fine)
- For production: a Vercel account and a managed Postgres. Email ([Resend](https://resend.com)) is optional.

## 4. Local installation

```bash
npm ci
cp .env.example .env.local          # then edit values (see §5)
npm run db:setup                     # creates the vapp_app role + runs migrations
npm run db:seed                      # TEST MODE ONLY — fictional demo data
npm run dev                          # http://localhost:3000
```

## 5. Environment variables

See [`.env.example`](.env.example). Summary:

| Variable | Where | Purpose |
|---|---|---|
| `APP_MODE` | all | `production` or `test` (test enables the fictional-data mailbox & seed) |
| `APP_URL` | all | Public base URL; must be `https://` in production |
| `DATABASE_URL` | Vercel + local | Runtime connection as **`vapp_app`** (least privilege) |
| `DATABASE_OWNER_URL` | **local/CI only** | Schema owner, used by migrations/seed/bootstrap. Never set in Vercel |
| `APP_DB_PASSWORD` | local/CI | Password to assign to `vapp_app` |
| `HMAC_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` | Vercel + local | Keyed hashing, MFA-secret encryption (32-byte base64), cron auth |
| `RESEND_API_KEY`, `EMAIL_FROM` | Vercel (optional) | Only for invitation/reset/reminder emails. Without them, links are shown on screen |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | optional | Bot challenge on suspicious volume |

The server refuses to start in production with an `http://` URL or development-looking secrets.

## 6. Database creation

Create an empty database (e.g. a new Supabase project or Neon database). Nothing else is required beforehand.

## 7. Database migration

```bash
DATABASE_OWNER_URL=... APP_DB_PASSWORD=... npm run db:roles     # once per database
DATABASE_OWNER_URL=... npm run db:migrate                        # every release
```

Migrations are plain SQL in `db/migrations/`, applied in order and recorded in `schema_migrations` with a checksum; editing an applied migration is refused.

## 8. Authentication setup

- **Super Admin:** `DATABASE_OWNER_URL=... npm run bootstrap:superadmin -- --email you@example.com --name "Your Name"`. A temporary password is printed once; MFA enrolment is forced at first sign-in. Recovery: same command with `--reset`.
- **College admins:** invited from the developer console; they set a password from a single-use 72-hour link. Self-service reset via email (college admins only).
- Optional platform policy: require MFA for all college admins (Configuration page).

## 9. Email provider setup

**Optional.** Voters verify with email + student ID, so V.app works with no email service. Without one: when you invite a college admin or issue a password reset, the single-use link is shown on screen in the developer console — send it yourself (WhatsApp, etc.); the "Email invitations/reminders" buttons tell admins to share the voting link themselves. To enable email later, create a Resend API key, verify your domain and set `RESEND_API_KEY` and `EMAIL_FROM`.

## 10. Development server

`npm run dev` (port 3000). Optional local cron: `npm run cron:local` (calls the protected cron endpoints every minute).

## 11. Running tests

```bash
npm test             # unit + integration (Vitest) — creates/destroys database "vapp_test"
npm run test:e2e     # Playwright — builds production bundle, uses database "vapp_e2e" on port 3100
```

Integration and E2E tests need a local PostgreSQL reachable as `postgres:postgres@localhost:5432` (override with `TEST_DB_OWNER`, `TEST_DB_HOST`, `E2E_DB_OWNER`, `E2E_DB_HOST`). Results: `test-results/`, report: [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## 12. Sample test accounts (test mode only)

After `npm run db:seed` (refuses unless `APP_MODE=test`):

| Account | Credentials |
|---|---|
| Super Admin | `dev@vapp.test` / `TestMode-Dev-2026!` · TOTP secret `VAPPDEMOSUPERADMINTESTMODE234567` (`npx tsx scripts/totp.ts <secret>` prints the current code, or add it to an authenticator app) |
| Northfield admin | `admin@northfield.test` / `TestMode-Admin-2026!` |
| Riverside admin | `admin@riverside.test` / `TestMode-Admin-2026!` |
| Students | `student001@northfield.test` … `student060@northfield.test` with student IDs `T0001` … `T0060` |

Seeded elections: an **open** union election (`/e/northfield-union-2026`), a **closed** sports election awaiting review (includes a deliberate tie), a **draft**, and a **scheduled** election at a second college.

## 13. Vercel deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short: import the repo, set env vars, run migrations from your machine/CI against the production database, bootstrap the Super Admin, deploy.

## 14. Scheduled jobs

`vercel.json` defines `/api/cron/tick` (lifecycle transitions + email delivery) and `/api/cron/retention` (pre-deletion notices + purge + housekeeping), authenticated with `Authorization: Bearer $CRON_SECRET`. The default schedule is **daily** because Vercel Hobby rejects more frequent crons; on Pro use `vercel.pro.json` (every 5 min / hourly). Voting open/close is enforced from timestamps at vote time, so it never depends on cron.

## 15. Voter import

Election → Voters → choose `.xlsx`/`.xls`/`.csv` → **Preview** → adjust column mapping → **Import**. Required: email and student ID columns. Optional: name, group (enables position-specific eligibility). Duplicates, invalid/missing emails and non-college domains are rejected with a downloadable report. Max 4 MB / 20,000 rows (configurable down). Files are parsed in memory and never stored.

## 16. Election creation

Wizard: Details → Voters → Positions & candidates → Voting rules → Review & activate. Use **Ballot preview** to see the student view. After activation the configuration is locked; before voting starts you can return to draft.

## 17. Result publication

After closing: Results → check integrity (all must pass; resolve incidents with notes) → confirm → **Publish**. Ties are shown, not broken. Share `/r/<ref>`. Optional 24-hour unpublish window. Exports: Excel report, candidate and position CSVs, participation, audit.

## 18. Data retention & cleanup

Chosen per election from platform-permitted periods (default 30 days after publication). Admins are notified before deletion. The purge deletes voters, sessions, codes, participation, ballots, imports, candidates/photos, banner; keeps the aggregate results page only if configured; writes a verified deletion receipt. Details: [VOTING_INTEGRITY.md §8](docs/VOTING_INTEGRITY.md).

## 19. Backup & recovery

Provided by your database host (Supabase daily backups/PITR, Neon history). Targets, runbooks and the backup-vs-deletion caveat: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## 20. Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid server environment: …` at startup | A required env var is missing/short; see §5 |
| `Role vapp_app does not exist` during migrate | Run `npm run db:roles` first |
| `permission denied for table …` | You're running migrations as `vapp_app`; use `DATABASE_OWNER_URL` |
| Student can't verify | Check their email and student ID in the voter list (Voters → search). After 5 wrong tries the email is locked for an hour |
| "Too many sign-in attempts" | Per-network limit (campus NAT); raise it in Configuration |
| Cron deployment fails on Hobby | Keep the daily `vercel.json`; don't use `vercel.pro.json` |
| Import says "could not be read" | Re-save as `.xlsx` or UTF-8 `.csv`; password-protected files aren't supported |
| Prepared-statement errors with a pooler | Already disabled (`prepare: false`); ensure you use the pooled URL |

## 21. Security limitations

Privacy is enforced by schema design, grants and RLS — not a cryptographic voting protocol. Anyone who knows both a student's email and student ID can vote as them. CSP allows inline scripts (Next.js hydration). Full list: [docs/SECURITY.md](docs/SECURITY.md).

## 22. Cross-platform installation

V.app is a Progressive Web App:
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** ⋮ → *Install app*.
- **macOS / Windows / Linux (Chrome, Edge, Brave):** install icon in the address bar, or ⋮ → *Install V.app*. Safari 17+ on macOS: File → *Add to Dock*.

The service worker caches only static assets and an offline page — never ballots, verification, admin pages or results. A PWA is **not** a native store app; a signed desktop installer (Tauri) or native mobile apps are not included — see [docs/DEPLOYMENT.md §Native packaging](docs/DEPLOYMENT.md#native-packaging).

## 23. Production launch checklist

See [docs/SECURITY.md › Production launch checklist](docs/SECURITY.md#production-launch-checklist).
