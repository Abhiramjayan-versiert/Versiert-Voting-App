#!/usr/bin/env bash
# Builds V.app in production mode and serves it against a disposable E2E database (fictional data only).
set -euo pipefail
PORT="${1:-3100}"
DB="${E2E_DB_NAME:-vapp_e2e}"
OWNER="${E2E_DB_OWNER:-postgres:postgres}"
HOSTPORT="${E2E_DB_HOST:-localhost:5432}"
APPPW="${APP_DB_PASSWORD:-local-dev-app-password-123}"
psql "postgres://$OWNER@$HOSTPORT/postgres" -qc "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
export NEXT_DIST_DIR=.next-e2e
export APP_MODE=test APP_URL="http://localhost:$PORT" APP_DB_PASSWORD="$APPPW"
export DATABASE_URL="postgres://vapp_app:$APPPW@$HOSTPORT/$DB" DATABASE_OWNER_URL="postgres://$OWNER@$HOSTPORT/$DB"
export HMAC_SECRET="e2e-only-hmac-secret-0123456789abcdef01234" ENCRYPTION_KEY="$(node -e 'console.log(Buffer.alloc(32,5).toString("base64"))')" CRON_SECRET="e2e-cron-secret-0123456789"
npx tsx scripts/setup-roles.ts >/dev/null && npx tsx scripts/migrate.ts >/dev/null && npx tsx scripts/seed-dev.ts >/dev/null
# Every E2E request comes from one IP; raise the per-network limits (per-account lockout stays in force).
psql "$DATABASE_OWNER_URL" -qc "insert into system_config (key, value) values ('rate_login_per_ip_per_15min', '500'), ('rate_otp_per_ip_per_hour', '1000') on conflict (key) do update set value = excluded.value" >/dev/null
if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then npx next build >/tmp/vapp-e2e-build.log 2>&1 || { tail -50 /tmp/vapp-e2e-build.log; exit 1; }; fi
exec npx next start -p "$PORT"
