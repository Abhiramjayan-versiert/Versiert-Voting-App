-- Run ONCE per database as a role with CREATEROLE (e.g. the Supabase/Neon "postgres" owner).
-- Creates the least-privilege login role the application uses at runtime.
-- The password is supplied by scripts/setup-roles.ts from APP_DB_PASSWORD; never commit it.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'vapp_app') then
    execute format('create role vapp_app login password %L nosuperuser nocreatedb nocreaterole noinherit', current_setting('vapp.app_password'));
  else
    execute format('alter role vapp_app with login password %L', current_setting('vapp.app_password'));
  end if;
end $$;
