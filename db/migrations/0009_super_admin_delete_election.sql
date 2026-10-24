-- Permanent deletion of an entire election (any status). Called only by the Super Admin
-- (enforced in the application and audit-logged). Bypasses ballot immutability for this one
-- purpose and returns counts for a deletion receipt.
create or replace function ballot.delete_election(p_election uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e elections%rowtype;
  c jsonb := '{}'::jsonb;
  n bigint;
begin
  select * into e from elections where id = p_election for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform set_config('ballot.purging', 'on', true);
  delete from ballot.selections where election_id = e.id;  get diagnostics n = row_count; c := c || jsonb_build_object('ballot_selections', n);
  delete from participations where election_id = e.id;     get diagnostics n = row_count; c := c || jsonb_build_object('participations', n);
  delete from vote_submissions where election_id = e.id;   get diagnostics n = row_count; c := c || jsonb_build_object('vote_submissions', n);
  select count(*) into n from voters where election_id = e.id;     c := c || jsonb_build_object('voters', n);
  select count(*) into n from candidates where election_id = e.id; c := c || jsonb_build_object('candidates', n);
  select count(*) into n from positions where election_id = e.id;  c := c || jsonb_build_object('positions', n);
  delete from publication_history where election_id = e.id;
  delete from result_snapshots where election_id = e.id;   get diagnostics n = row_count; c := c || jsonb_build_object('result_snapshots', n);
  delete from elections where id = e.id;                   -- cascades voters, positions, candidates, sessions, imports, jobs
  return c || jsonb_build_object('status_at_deletion', e.status, 'public_ref', e.public_ref, 'college_id', e.college_id);
end $$;
revoke execute on function ballot.delete_election(uuid) from public;
grant execute on function ballot.delete_election(uuid) to vapp_app;
