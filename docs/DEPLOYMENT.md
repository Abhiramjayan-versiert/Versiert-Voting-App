# Deployment (Vercel + managed PostgreSQL)

## Services you need

| Service | Purpose | Cost notes |
|---|---|---|
| **Vercel** | Hosts the Next.js app and runs cron jobs | Hobby: crons limited to once/day (±59 min), 300 s max function duration. Pro: per-minute crons, longer durations. Request/response bodies are capped at 4.5 MB — V.app limits uploads to 4 MB. |
| **PostgreSQL 14+** (Supabase or Neon recommended) | All data, including images | Free tiers have storage/compute caps and limited backup retention; production elections should use a paid tier with PITR. |
| **Resend** (optional) | Admin invitation/reset emails, voter reminders | Not needed: voters verify with email + student ID and links are shown on screen without it. |
| Cloudflare Turnstile (optional) | Bot challenge | Free. |

No object storage is required: uploaded spreadsheets are processed in memory and never stored; candidate photos, banners and logos (≤ 800 KB each) are stored in PostgreSQL and deleted with their rows. Nothing depends on the local filesystem.

## Step by step

1. **Create the database.** Supabase: new project → Settings → Database → copy the *direct* connection string (owner) and the *transaction pooler* string (port 6543). Neon: copy the direct and the pooled strings.
2. **Create the app role and schema** from your machine or CI (never from Vercel):
   ```bash
   export DATABASE_OWNER_URL="postgres://postgres:<owner-password>@<direct-host>:5432/postgres"
   export APP_DB_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
   npm ci && npm run db:roles && npm run db:migrate
   ```
3. **Build the runtime URL** using role `vapp_app` and `APP_DB_PASSWORD` on the **pooled** host. Supabase's pooler expects the username in the form `<role>.<project-ref>` (the same pattern as `postgres.<project-ref>` shown in its dashboard) — confirm in the Supabase connection docs for your project. Example: `postgres://vapp_app.abcdefgh:<APP_DB_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`.
4. **Generate secrets:** `node -e "for (const k of ['HMAC_SECRET','ENCRYPTION_KEY','CRON_SECRET']) console.log(k+'='+require('crypto').randomBytes(32).toString('base64'))"`
5. **Vercel project:** import the repository → Framework *Next.js* → set environment variables (Production): `APP_MODE=production`, `APP_URL=https://<your-domain>`, `DATABASE_URL`, `HMAC_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, optional `RESEND_API_KEY` + `EMAIL_FROM`. Do **not** add `DATABASE_OWNER_URL` or `APP_DB_PASSWORD`.
6. **Region:** `vercel.json` pins functions to `bom1` (Mumbai). Pick the region closest to your database.
7. **Cron:** `vercel.json` schedules both jobs daily (Hobby-compatible). On Pro, replace it with `vercel.pro.json` for 5-minute lifecycle ticks. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`. On Hobby, you can additionally trigger `/api/cron/tick` from any external scheduler that can send that header, or use *Jobs & cleanup → Deliver emails* in the console.
8. **Deploy**, then provision the platform owner from your machine:
   `DATABASE_OWNER_URL=... npm run bootstrap:superadmin -- --email you@your-domain --name "Your Name"`
9. **Sign in** at `https://<your-domain>/admin/login`, enrol MFA, change the temporary password (Account), review **Configuration**, then create the first college.
10. **Custom domain & HTTPS:** add the domain in Vercel; HSTS is sent automatically in production mode.

## Auth redirect URLs

V.app has no third-party OAuth callbacks. All links in emails are built from `APP_URL` (`/invite/<token>`, `/admin/reset/<token>`, `/e/<slug>`, `/r/<ref>`), so `APP_URL` must exactly match the production domain.

## Error monitoring

Server errors are logged without secrets or ballot data (`[action]`, `[submit]`, `[ui]` prefixes). Recommended: Vercel Log Drains or Sentry (`@sentry/nextjs`) with PII scrubbing enabled; never attach request bodies from `/e/*/submit`. Point an uptime monitor at `/api/health`.

## Scaling notes

- Each serverless instance opens up to `DB_POOL_MAX` (default 5) connections; use the provider's pooler.
- Vote submission is a single database function call; a few thousand voters per election is comfortably within limits. Very large imports (> 20k rows) should be split into several files.
- Retention purges run in one transaction per election inside the 300 s function limit; for extremely large elections run `npm run cron:local -- --once` from a machine with `APP_URL` pointed at production, or move the job to a worker.

## Native packaging

- **PWA (included):** installable on iOS, Android, macOS, Windows and Linux from the browser.
- **Desktop installer (not included):** wrap the deployed URL with [Tauri](https://tauri.app) (`npm create tauri-app`, set `build.devUrl`/`app.windows[0].url` to your domain). Requires the Rust toolchain plus code-signing certificates (Apple Developer ID + notarisation for macOS, an Authenticode certificate for Windows). Not built here because the build environment had no Rust toolchain or signing identities.
- **Store apps (not included):** iOS/Android store distribution needs native wrappers (e.g. Capacitor), Apple/Google developer accounts, signing, and store review. A PWA is not the same as a native app.
