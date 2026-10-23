-- Row Level Security for tenant isolation + least-privilege grants for the app role.
-- The app role `vapp_app` is created by db/roles.sql (needs CREATEROLE once).

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'vapp_app') then
    raise exception 'Role vapp_app does not exist. Run db/roles.sql (npm run db:roles) first.';
  end if;
end $$;

-- ---- RLS on tenant-scoped tables -------------------------------------------
alter table colleges           enable row level security;
alter table college_admins     enable row level security;
alter table elections          enable row level security;
alter table positions          enable row level security;
alter table candidates         enable row level security;
alter table voters             enable row level security;
alter table voter_imports      enable row level security;
alter table import_errors      enable row level security;
alter table participations     enable row level security;
alter table vote_submissions   enable row level security;
alter table result_snapshots   enable row level security;
alter table publication_history enable row level security;
alter table cleanup_jobs       enable row level security;

create policy tenant_colleges on colleges for all
  using (app.can_access_college(id)) with check (app.ctx_role() in ('super_admin', 'system'));
create policy tenant_college_admins on college_admins for all
  using (app.can_access_college(college_id)) with check (app.ctx_role() in ('super_admin', 'system'));

create policy tenant_elections on elections for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_positions on positions for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_candidates on candidates for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_voters on voters for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_voter_imports on voter_imports for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_import_errors on import_errors for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_participations on participations for select
  using (app.can_access_college(college_id));
create policy tenant_vote_submissions on vote_submissions for select
  using (app.can_access_college(college_id));
create policy tenant_result_snapshots on result_snapshots for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_publication_history on publication_history for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));
create policy tenant_cleanup_jobs on cleanup_jobs for all
  using (app.can_access_college(college_id)) with check (app.can_access_college(college_id));

-- ---- Grants ----------------------------------------------------------------
revoke all on all tables in schema public from vapp_app;
revoke all on schema ballot from vapp_app;
revoke all on all tables in schema ballot from vapp_app;

grant usage on schema public, app to vapp_app;
grant execute on all functions in schema app to vapp_app;
grant usage on schema ballot to vapp_app;
grant execute on function ballot.cast_votes(text, text, jsonb) to vapp_app;
grant execute on function ballot.tally(uuid) to vapp_app;
grant execute on function ballot.open_register(uuid) to vapp_app;
grant execute on function ballot.purge_election(uuid, boolean) to vapp_app;
grant execute on function ballot.purge_leftovers(uuid) to vapp_app;
revoke execute on all functions in schema ballot from public;
grant execute on function ballot.cast_votes(text, text, jsonb) to vapp_app;
grant execute on function ballot.tally(uuid) to vapp_app;
grant execute on function ballot.open_register(uuid) to vapp_app;
grant execute on function ballot.purge_election(uuid, boolean) to vapp_app;
grant execute on function ballot.purge_leftovers(uuid) to vapp_app;

grant select, insert, update, delete on
  users, sessions, auth_tokens, colleges, college_admins, elections, positions, candidates,
  voters, voter_imports, import_errors, otp_challenges, voter_sessions,
  result_snapshots, publication_history, notifications, dev_mailbox, rate_limits,
  system_config, job_runs, cleanup_jobs, security_events
to vapp_app;
-- Participation is written only by ballot.cast_votes; the app may read it (for turnout).
grant select on participations, vote_submissions to vapp_app;
-- Audit log: insert + read only (UPDATE/DELETE also blocked by trigger).
grant select, insert on audit_events, deletion_receipts to vapp_app;
grant usage on all sequences in schema public to vapp_app;
