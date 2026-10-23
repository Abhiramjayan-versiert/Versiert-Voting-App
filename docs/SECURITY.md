# Security controls, limitations and launch checklist

## Controls implemented

| Area | Implementation |
|---|---|
| Authorisation | Every page/action/route calls `requireSuperAdmin()` / `requireCollegeAdmin(collegeId)` / `adminForApi()` on the server. Hidden buttons are never relied on. |
| Tenant isolation | PostgreSQL Row Level Security on all college-scoped tables using a per-transaction context (`app.role`, `app.college_ids`); elections from other colleges return 404. |
| Least privilege | Runtime role `vapp_app`: no access to `ballot.*` tables, read-only participation, insert-only audit log, cannot create Super Admins. Owner credentials never deployed. |
| Passwords | Argon2id (19 MiB, t=2), 12+ chars, common-password and email-name checks, lockout after 5 failures (15 min), timing-equalised unknown-account path. |
| MFA | RFC 6238 TOTP, mandatory for Super Admin, optional/required (policy) for college admins; secrets AES-256-GCM encrypted; replayed codes rejected. |
| Sessions | 256-bit random tokens, only SHA-256 stored, `HttpOnly`, `SameSite`, `Secure` + `__Host-` prefix in production, idle tracking, revocation (self, Super Admin, password change). |
| Voter verification | Email OTP (HMAC-stored, 10 min, 5 attempts), uniform responses and timing, short path-scoped sessions. |
| CSRF | Server Actions' built-in Origin check; explicit same-origin check on the vote route; `SameSite` cookies. |
| XSS | React escaping; no user HTML rendered; CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`). |
| SQL injection | Parameterised tagged-template queries throughout. |
| Input validation | Zod schemas + DB `CHECK` constraints; image magic-byte validation; spreadsheet type/size/row checks. |
| Spreadsheet safety | Extension + magic-byte match; formulas never evaluated; formula-injection neutralised in all CSV/XLSX exports. |
| Rate limiting | Postgres-backed fixed windows (login per network/account, codes per network/address, verify attempts, submissions, receipt checks); optional Turnstile. |
| Replay / duplicates | Idempotency keys + unique constraints + advisory locks (see VOTING_INTEGRITY.md). |
| Audit | Hash-chained append-only log with on-demand verification; sensitive keys scrubbed. |
| Logging | No passwords, codes, tokens, ballot choices or raw IPs (keyed hashes only). |
| Headers | CSP, HSTS (prod), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP; `X-Powered-By` removed; `no-store` on authenticated areas. |
| Cron | Bearer secret compared in constant time. |
| PWA | Service worker never caches sensitive routes. |
| Dependencies | `npm audit` run at build time (see below). |

## Dependency audit (at time of build)

`npm audit` reports 2 **moderate** advisories in `uuid < 11.1.1` (missing buffer bounds check when a caller passes its own buffer to v3/v5/v6), pulled in by `exceljs`. V.app never calls those APIs; exceljs uses `uuid.v4()` without a buffer. Tracked as accepted risk; re-check on upgrade. SheetJS is installed from the `@e965/xlsx` npm mirror of the patched 0.20.3 release because the official CDN wasn't reachable from the build environment — for production you may switch to the official tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`).

## Known limitations

1. **Not a cryptographic voting protocol.** Secret-ballot privacy relies on schema separation, grants and RLS. A DBA with owner access could attempt correlation via physical row order. No end-to-end verifiability.
2. **Email ≠ identity.** Verification proves inbox control, not who holds the device or freedom from coercion. Integrate institutional SSO for higher assurance.
3. **Small electorates** can reveal choices through totals; live tallies can leak the latest choice in low-traffic periods (configurable, warned).
4. **CSP allows `'unsafe-inline'` scripts** (Next.js hydration). A nonce-based CSP via `proxy.ts` is a recommended hardening step.
5. **Rate limits are per network.** Campus NAT can make many students share one IP; defaults are generous and configurable.
6. **Backups** retain deleted data until they expire.
7. **Cron precision on Vercel Hobby** is daily ±59 min: status labels, email delivery and retention run late (voting windows themselves are enforced exactly).
8. **No native desktop/mobile packages** — PWA only.
9. **Single-region**; no built-in multi-region failover.

## Production launch checklist

- [ ] `APP_MODE=production`, `APP_URL` is the final `https://` domain
- [ ] Fresh random `HMAC_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` (never reuse test values)
- [ ] `DATABASE_URL` uses role `vapp_app` via the pooler; `DATABASE_OWNER_URL` is **not** in Vercel
- [ ] `npm run db:migrate` applied; `npm run db:seed` **never** run against production (it refuses unless `APP_MODE=test`)
- [ ] Super Admin bootstrapped, MFA enrolled, temporary password changed
- [ ] Resend domain verified (SPF/DKIM), test email received, sending quota sufficient
- [ ] Backups/PITR enabled; retention ≤ shortest election retention where possible; restore rehearsed once
- [ ] Cron jobs visible in Vercel → Settings → Cron Jobs; Health page shows recent runs
- [ ] Configuration reviewed: retention choices, MFA policy, rate limits, open-ballot feature flag
- [ ] Uptime monitor on `/api/health`; log drain/error monitoring with PII scrubbing
- [ ] Run a dry-run election with 3–5 staff members end to end, including publish and export
- [ ] Publish a privacy notice and the election rules (tie-break policy) for students
- [ ] Confirm `/dev/inbox` and `/platform/mailbox` return 404 in production
