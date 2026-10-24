-- Supabase compatibility & hardening (harmless on plain PostgreSQL).
-- 1) Supabase installs pgcrypto in schema "extensions"; make every function that uses it find it.
alter function app.audit_chain() set search_path = public, extensions, pg_temp;
alter function app.verify_audit_chain() set search_path = public, extensions, pg_temp;
alter function ballot.cast_votes(text, text, jsonb) set search_path = public, extensions, pg_temp;
alter role vapp_app set search_path = public, extensions;
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    grant usage on schema extensions to vapp_app;
  end if;
end $$;

-- 2) Supabase exposes the "public" schema through its auto-generated REST/GraphQL API to the
--    roles anon/authenticated. V.app never uses that API, so remove every privilege they have.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on schema app, ballot from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
