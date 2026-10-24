-- Super Admin: permanently delete a college and everything that belongs to it.
-- Every election is removed through ballot.delete_election (which is allowed to remove immutable
-- ballot rows); the college row then cascades to its remaining dependent rows. The audit log is
-- append-only and keeps its history (it has no foreign key to colleges).
create or replace function ballot.delete_college(p_college uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c   colleges%rowtype;
  e   record;
  refs jsonb := '[]'::jsonb;
  n_admins int;
begin
  select * into c from colleges where id = p_college for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  for e in select id, public_ref, status from elections where college_id = c.id loop
    perform ballot.delete_election(e.id);
    refs := refs || jsonb_build_object('public_ref', e.public_ref, 'status', e.status, 'election_id', e.id);
  end loop;
  select count(*) into n_admins from college_admins where college_id = c.id;
  delete from colleges where id = c.id;
  return jsonb_build_object('code', c.code, 'name', c.name, 'elections', refs, 'admin_assignments', n_admins);
end $$;

revoke execute on function ballot.delete_college(uuid) from public;
grant execute on function ballot.delete_college(uuid) to vapp_app;
