-- V.app core schema. Run as the schema OWNER role (see scripts/migrate.ts).
-- The application connects as the least-privilege role `vapp_app` (see db/roles.sql).

create extension if not exists pgcrypto;

create schema if not exists app;     -- helper functions
create schema if not exists ballot;  -- secret ballot storage; app role has NO table privileges here

-- ---------------------------------------------------------------------------
-- Request context helpers (used by Row Level Security)
-- The server sets these with set_config(..., true) inside every transaction.
-- ---------------------------------------------------------------------------
create or replace function app.ctx_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.role', true), ''), 'anonymous')
$$;

create or replace function app.ctx_user() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.ctx_colleges() returns uuid[] language sql stable as $$
  select coalesce(nullif(current_setting('app.college_ids', true), '')::uuid[], '{}'::uuid[])
$$;

create or replace function app.can_access_college(cid uuid) returns boolean language sql stable as $$
  select app.ctx_role() in ('super_admin', 'system') or cid = any(app.ctx_colleges())
$$;

create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- Users, sessions, invitations
-- ---------------------------------------------------------------------------
create table users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique check (email = lower(btrim(email)) and length(email) between 3 and 254),
  name             text not null check (length(name) between 1 and 120),
  role             text not null check (role in ('super_admin', 'college_admin')),
  status           text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'revoked')),
  password_hash    text,
  mfa_secret_enc   text,
  mfa_enabled      boolean not null default false,
  failed_logins    int not null default 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger users_touch before update on users for each row execute function app.touch_updated_at();

-- Super Admin can only be provisioned by the schema owner (bootstrap script), never by the app role.
create or replace function app.guard_super_admin() returns trigger language plpgsql as $$
begin
  if new.role = 'super_admin' and (tg_op = 'INSERT' or old.role <> 'super_admin') and current_user = 'vapp_app' then
    raise exception 'super_admin can only be provisioned by the platform owner' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.role = 'super_admin' and new.role <> 'super_admin' and current_user = 'vapp_app' then
    raise exception 'super_admin role cannot be changed by the application' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger users_guard_super before insert or update on users for each row execute function app.guard_super_admin();

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  mfa_passed    boolean not null default false,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index sessions_user_idx on sessions(user_id);

create table auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  purpose     text not null check (purpose in ('invite', 'password_reset')),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Colleges and administrator assignments
-- ---------------------------------------------------------------------------
create table colleges (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,23}$'),
  name                    text not null check (length(name) between 2 and 160),
  short_name              text,
  city                    text,
  email_domains           text[] not null default '{}',
  status                  text not null default 'active' check (status in ('active', 'suspended')),
  default_retention_days  int not null default 30 check (default_retention_days between 1 and 3650),
  logo                    bytea,
  logo_mime               text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger colleges_touch before update on colleges for each row execute function app.touch_updated_at();

create table college_admins (
  user_id     uuid not null references users(id) on delete cascade,
  college_id  uuid not null references colleges(id) on delete cascade,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, college_id)
);
create index college_admins_college_idx on college_admins(college_id);

-- ---------------------------------------------------------------------------
-- Elections
-- Lifecycle: draft → scheduled → open → closed → results_pending → published → retention → deleted
-- 'paused' is an emergency state reachable from open.
-- ---------------------------------------------------------------------------
create table elections (
  id                        uuid primary key default gen_random_uuid(),
  college_id                uuid not null references colleges(id) on delete restrict,
  slug                      text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{3,80}$'),
  public_ref                text not null unique,
  event_name                text not null check (length(event_name) between 2 and 160),
  title                     text not null check (length(title) between 2 and 160),
  description               text check (length(description) <= 4000),
  academic_year             text,
  department                text,
  banner                    bytea,
  banner_mime               text,
  starts_at                 timestamptz not null,
  ends_at                   timestamptz not null,
  timezone                  text not null default 'Asia/Kolkata',
  status                    text not null default 'draft' check (status in
                              ('draft','scheduled','open','paused','closed','results_pending','published','retention','deleted')),
  secret_ballot             boolean not null default true,
  allow_abstain             boolean not null default false,
  require_all_positions     boolean not null default false,
  admin_live_results        boolean not null default true,
  results_require_approval  boolean not null default true,
  allow_unpublish           boolean not null default false,
  retention_days            int not null default 30 check (retention_days between 1 and 3650),
  keep_public_results       boolean not null default true,
  activated_at              timestamptz,
  activated_by              uuid references users(id) on delete set null,
  closed_at                 timestamptz,
  published_at              timestamptz,
  published_by              uuid references users(id) on delete set null,
  purge_after               timestamptz,
  deleted_at                timestamptz,
  created_by                uuid references users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index elections_college_idx on elections(college_id);
create index elections_status_idx on elections(status);
create trigger elections_touch before update on elections for each row execute function app.touch_updated_at();

create table positions (
  id               uuid primary key default gen_random_uuid(),
  election_id      uuid not null references elections(id) on delete cascade,
  college_id       uuid not null references colleges(id) on delete cascade,
  name             text not null check (length(name) between 1 and 120),
  description      text check (length(description) <= 1000),
  sort_order       int not null default 0,
  max_selections   int not null default 1 check (max_selections between 1 and 20),
  eligible_groups  text[],               -- NULL = every eligible voter of the election
  created_at       timestamptz not null default now(),
  unique (election_id, name),
  unique (id, election_id)
);
create index positions_election_idx on positions(election_id);

create table candidates (
  id           uuid primary key default gen_random_uuid(),
  position_id  uuid not null,
  election_id  uuid not null,
  college_id   uuid not null references colleges(id) on delete cascade,
  full_name    text not null check (length(full_name) between 1 and 120),
  department   text,
  year_label   text,
  student_id   text,
  intro        text check (length(intro) <= 500),
  manifesto    text check (length(manifesto) <= 5000),
  symbol       text check (length(symbol) <= 40),
  photo        bytea,
  photo_mime   text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  status       text not null default 'active' check (status in ('active', 'withdrawn', 'disqualified')),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  foreign key (position_id, election_id) references positions(id, election_id) on delete cascade,
  unique (id, position_id)
);
create index candidates_position_idx on candidates(position_id);

-- ---------------------------------------------------------------------------
-- Voter registry and imports
-- ---------------------------------------------------------------------------
create table voter_imports (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references elections(id) on delete cascade,
  college_id   uuid not null references colleges(id) on delete cascade,
  filename     text not null,
  status       text not null default 'completed' check (status in ('completed', 'failed')),
  total_rows   int not null default 0,
  accepted     int not null default 0,
  rejected     int not null default 0,
  duplicates   int not null default 0,
  already_registered int not null default 0,
  mapping      jsonb not null default '{}',
  error        text,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index voter_imports_election_idx on voter_imports(election_id);

create table import_errors (
  id          bigserial primary key,
  import_id   uuid not null references voter_imports(id) on delete cascade,
  college_id  uuid not null references colleges(id) on delete cascade,
  row_number  int not null,
  raw         jsonb not null,
  reason      text not null
);
create index import_errors_import_idx on import_errors(import_id);

create table voters (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references elections(id) on delete cascade,
  college_id   uuid not null references colleges(id) on delete cascade,
  email        text not null check (email = lower(btrim(email))),
  student_id   text,
  name         text,
  voter_group  text,
  import_id    uuid references voter_imports(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (election_id, email)
);
create index voters_election_idx on voters(election_id);

-- ---------------------------------------------------------------------------
-- Voter verification (one-time codes) and short-lived voting sessions
-- Email addresses are stored only as keyed HMACs here.
-- ---------------------------------------------------------------------------
create table otp_challenges (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references elections(id) on delete cascade,
  email_hmac   text not null,
  voter_id     uuid references voters(id) on delete cascade,  -- NULL when email not eligible (uniform response)
  code_hash    text not null,
  attempts     int not null default 0,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index otp_lookup_idx on otp_challenges(election_id, email_hmac, created_at desc);

create table voter_sessions (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  voter_id     uuid not null references voters(id) on delete cascade,
  election_id  uuid not null references elections(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index voter_sessions_voter_idx on voter_sessions(voter_id);

-- ---------------------------------------------------------------------------
-- Participation (WHO voted for WHICH POSITION) — never stores the choice.
-- The UNIQUE constraint is the core one-vote-per-position rule.
-- ---------------------------------------------------------------------------
create table vote_submissions (
  id               uuid primary key default gen_random_uuid(),
  election_id      uuid not null references elections(id) on delete cascade,
  college_id       uuid not null references colleges(id) on delete cascade,
  voter_id         uuid not null references voters(id) on delete cascade,
  idempotency_key  text not null check (length(idempotency_key) between 16 and 100),
  receipt_code     text not null unique,
  result           jsonb not null,
  created_at       timestamptz not null default now(),
  unique (voter_id, idempotency_key)
);

create table participations (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete cascade,
  college_id     uuid not null references colleges(id) on delete cascade,
  position_id    uuid not null,
  voter_id       uuid not null references voters(id) on delete cascade,
  submission_id  uuid not null references vote_submissions(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint participations_one_vote_per_position unique (election_id, voter_id, position_id),
  foreign key (position_id, election_id) references positions(id, election_id) on delete cascade
);
create index participations_election_idx on participations(election_id, position_id);

-- ---------------------------------------------------------------------------
-- Secret ballot store. NO voter reference, NO timestamp, random UUID keys.
-- voter_ref is populated ONLY for elections explicitly configured as open (non-secret) ballots.
-- ---------------------------------------------------------------------------
create table ballot.selections (
  id            uuid primary key default gen_random_uuid(),
  election_id   uuid not null references elections(id) on delete cascade,
  position_id   uuid not null references positions(id) on delete cascade,
  candidate_id  uuid references candidates(id) on delete cascade,  -- NULL = abstention
  voter_ref     uuid references voters(id) on delete cascade
);
create index selections_tally_idx on ballot.selections(election_id, position_id, candidate_id);

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
create table result_snapshots (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references elections(id) on delete cascade,
  college_id   uuid not null references colleges(id) on delete cascade,
  kind         text not null check (kind in ('published')),
  data         jsonb not null,
  data_hash    text not null,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index result_snapshots_election_idx on result_snapshots(election_id, created_at desc);

create table publication_history (
  id           uuid primary key default gen_random_uuid(),
  election_id  uuid not null references elections(id) on delete cascade,
  college_id   uuid not null references colleges(id) on delete cascade,
  action       text not null check (action in ('publish', 'unpublish')),
  snapshot_id  uuid references result_snapshots(id) on delete set null,
  actor_id     uuid references users(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit (hash-chained, append-only) and security events
-- ---------------------------------------------------------------------------
create table audit_events (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_label  text not null,
  college_id   uuid,
  election_id  uuid,
  action       text not null,
  target       text,
  details      jsonb not null default '{}',
  ip_hash      text,
  prev_hash    text not null,
  hash         text not null
);
create index audit_college_idx on audit_events(college_id, id desc);
create index audit_election_idx on audit_events(election_id, id desc);

create or replace function app.audit_chain() returns trigger language plpgsql as $$
declare last_hash text;
begin
  perform pg_advisory_xact_lock(7311001);
  select hash into last_hash from audit_events order by id desc limit 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.at := coalesce(new.at, now());
  new.hash := encode(digest(
    new.prev_hash || '|' || new.id::text || '|' || to_char(new.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
    coalesce(new.actor_id::text, '') || '|' || new.actor_label || '|' || coalesce(new.college_id::text, '') || '|' ||
    coalesce(new.election_id::text, '') || '|' || new.action || '|' || coalesce(new.target, '') || '|' || new.details::text,
    'sha256'), 'hex');
  return new;
end $$;
create trigger audit_events_chain before insert on audit_events for each row execute function app.audit_chain();

create or replace function app.append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
create trigger audit_events_immutable before update or delete on audit_events for each row execute function app.append_only();

create or replace function app.verify_audit_chain() returns table(ok boolean, checked bigint, first_bad_id bigint)
language plpgsql stable as $$
declare r record; expected text; prev text := repeat('0', 64); n bigint := 0;
begin
  for r in select * from audit_events order by id loop
    n := n + 1;
    expected := encode(digest(
      prev || '|' || r.id::text || '|' || to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
      coalesce(r.actor_id::text, '') || '|' || r.actor_label || '|' || coalesce(r.college_id::text, '') || '|' ||
      coalesce(r.election_id::text, '') || '|' || r.action || '|' || coalesce(r.target, '') || '|' || r.details::text,
      'sha256'), 'hex');
    if r.prev_hash <> prev or r.hash <> expected then
      return query select false, n, r.id; return;
    end if;
    prev := r.hash;
  end loop;
  return query select true, n, null::bigint;
end $$;

create table security_events (
  id           uuid primary key default gen_random_uuid(),
  at           timestamptz not null default now(),
  kind         text not null,
  severity     text not null check (severity in ('info', 'warning', 'critical')),
  college_id   uuid references colleges(id) on delete cascade,
  election_id  uuid references elections(id) on delete cascade,
  requires_review boolean not null default false,
  details      jsonb not null default '{}',
  ip_hash      text,
  resolved_at  timestamptz,
  resolved_by  uuid references users(id) on delete set null,
  resolution   text
);
create index security_events_election_idx on security_events(election_id) where resolved_at is null;
create index security_events_at_idx on security_events(at desc);

-- ---------------------------------------------------------------------------
-- Notifications, rate limiting, config, jobs, retention
-- ---------------------------------------------------------------------------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid references colleges(id) on delete cascade,
  election_id  uuid references elections(id) on delete cascade,
  kind         text not null,
  to_email     text not null,
  subject      text not null,
  body_text    text not null,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts     int not null default 0,
  last_error   text,
  dedupe_key   text unique,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index notifications_pending_idx on notifications(status, created_at) where status = 'pending';

-- Test-mode-only mailbox. The app refuses to write here when APP_MODE=production.
create table dev_mailbox (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text not null,
  body_text  text not null,
  created_at timestamptz not null default now()
);

create table rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         int not null
);

create table system_config (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table job_runs (
  id           uuid primary key default gen_random_uuid(),
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  details      jsonb not null default '{}'
);
create index job_runs_job_idx on job_runs(job, started_at desc);

create table cleanup_jobs (
  id            uuid primary key default gen_random_uuid(),
  election_id   uuid not null unique references elections(id) on delete cascade,
  college_id    uuid not null references colleges(id) on delete cascade,
  status        text not null default 'scheduled' check (status in ('scheduled', 'notified', 'running', 'completed', 'failed')),
  run_after     timestamptz not null,
  notified_at   timestamptz,
  attempts      int not null default 0,
  last_error    text,
  processed     jsonb not null default '{}',
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Minimal, non-sensitive record that a deletion happened. Survives the purge.
create table deletion_receipts (
  id             uuid primary key default gen_random_uuid(),
  election_ref   text not null,
  college_id     uuid references colleges(id) on delete set null,
  election_id    uuid,  -- intentionally not a foreign key
  kept_aggregate boolean not null,
  counts         jsonb not null,
  verified       boolean not null,
  completed_at   timestamptz not null default now()
);
