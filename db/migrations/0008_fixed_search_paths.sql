-- Pin search_path on every helper function (Supabase security advisor 0011).
alter function app.ctx_role() set search_path = public, pg_temp;
alter function app.ctx_user() set search_path = public, pg_temp;
alter function app.ctx_colleges() set search_path = public, pg_temp;
alter function app.can_access_college(uuid) set search_path = public, pg_temp;
alter function app.touch_updated_at() set search_path = public, pg_temp;
alter function app.guard_super_admin() set search_path = public, pg_temp;
alter function app.append_only() set search_path = public, pg_temp;
alter function app.voter_eligible_for_position(text, text[]) set search_path = public, pg_temp;
alter function app.election_accepting(elections) set search_path = public, pg_temp;
alter function app.snapshot_delete_guard() set search_path = public, pg_temp;
alter function ballot.block_mutation() set search_path = public, pg_temp;
