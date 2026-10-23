-- Let the app role read migration status for the health page.
create table if not exists schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now());
grant select on schema_migrations to vapp_app;
