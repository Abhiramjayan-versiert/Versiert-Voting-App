# Operations, backup & recovery

## Responsibilities

| Area | Owner |
|---|---|
| Platform configuration, colleges, admin accounts, incident review | Platform owner (Super Admin) |
| Elections, voter lists, publication, tie resolution under college rules | College election administrators |
| Database backups, PITR, encryption at rest | Database provider (configured by platform owner) |
| Hosting, TLS, cron execution | Vercel (configured by platform owner) |

## Backup targets

| Objective | Recommended setting |
|---|---|
| **RPO** (max data loss) | ≤ 5 minutes with point-in-time recovery (Supabase PITR add-on / Neon history); ≤ 24 h with daily backups only |
| **RTO** (time to restore) | ≤ 4 hours |
| Backup retention | 7–14 days. Keep it **shorter than or equal to** your shortest election retention period where possible, so deleted voter data ages out of backups promptly. |

Record the actual configuration in *Configuration → Backup status note* so it appears on the Health page.

## During an election

- Avoid schema migrations while any election is open.
- If something is wrong: **Pause** (ends voter sessions) → fix (add voters / withdraw candidate with a reason) → **Resume** (optionally extend the closing time). Accepted ballots are never edited.
- If you suspect fraud: **Report an incident** on the election. Publication is blocked until resolved with a written note.

## Restore runbook

1. Pause all open elections (or enable maintenance mode).
2. Restore the database to a new instance / branch at the chosen point in time.
3. Run `npm run db:migrate` against it (no-op if already current).
4. Point `DATABASE_URL` in Vercel to the restored instance and redeploy.
5. Verify: `/api/health`, *Developer console → Audit log* shows "Chain verified", *Health* checks.
6. Re-run `retentionRun` from the console (Jobs → Retention cleanup) — elections whose retention expired after the restore point are deleted again.
7. Record the restore in the incident log.

**Important:** a restore can bring back voter data that had already been deleted under the retention policy. Step 6 removes it again; document the event.

## Super Admin account recovery

Out-of-band only (never via email):
```bash
DATABASE_OWNER_URL=... npm run bootstrap:superadmin -- --email owner@your-domain --reset
```
This sets a new temporary password, clears MFA (forcing re-enrolment) and revokes all sessions. It is recorded in the audit log.

## Secret rotation

- `CRON_SECRET`: rotate any time (update Vercel, redeploy).
- `HMAC_SECRET`: rotating invalidates pending one-time codes and changes IP-hash continuity; do it between elections.
- `ENCRYPTION_KEY`: rotating makes existing MFA secrets unreadable — all admins must re-enrol (Super Admin via `--reset`). Do it deliberately.
- `APP_DB_PASSWORD`: re-run `npm run db:roles` with the new value, then update `DATABASE_URL`.

## Monitoring

- `/api/health` for uptime.
- Developer console: Overview alerts, Security events, Jobs & cleanup (failed deletions retry automatically up to 10 times; *Retry* button available), Health page (cron freshness, email provider).
