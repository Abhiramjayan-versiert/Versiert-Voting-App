-- Ballot casting, tallying and purge. These run as SECURITY DEFINER (schema owner)
-- so the application role never needs direct table access to ballot.selections.

-- Position eligibility: NULL eligible_groups = everyone in the election's registry.
create or replace function app.voter_eligible_for_position(p_voter_group text, p_groups text[])
returns boolean language sql immutable as $$
  select p_groups is null or cardinality(p_groups) = 0
      or (p_voter_group is not null and lower(p_voter_group) = any(select lower(g) from unnest(p_groups) g))
$$;

-- Effective "accepting votes" check, independent of cron timing.
create or replace function app.election_accepting(e elections) returns boolean language sql stable as $$
  select e.status in ('scheduled', 'open') and now() >= e.starts_at and now() < e.ends_at
$$;

-- -----------------------------------------------------------------------------
-- ballot.cast_votes
--   p_session_hash : SHA-256 of the voter session token (validated here, not trusted from the app)
--   p_idem         : client idempotency key (same key → same stored result, nothing re-applied)
--   p_choices      : [{"position_id": uuid, "candidate_ids": [uuid, ...]}]  (empty array = abstain)
-- Returns jsonb: {"receipt": text, "replayed": bool, "positions": [{"position_id", "status"}]}
--   status ∈ accepted | already_voted
-- Raises P0001 with a machine-readable message for every validation failure; nothing is written then.
-- -----------------------------------------------------------------------------
create or replace function ballot.cast_votes(p_session_hash text, p_idem text, p_choices jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s          voter_sessions%rowtype;
  v          voters%rowtype;
  e          elections%rowtype;
  existing   vote_submissions%rowtype;
  sub_id     uuid := gen_random_uuid();
  receipt    text;
  choice     jsonb;
  pos        positions%rowtype;
  cand_ids   uuid[];
  cid        uuid;
  part_id    uuid;
  out_items  jsonb := '[]'::jsonb;
  accepted_n int := 0;
  seen       uuid[] := '{}';
  missing    int;
begin
  if p_choices is null or jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) = 0 then
    raise exception 'EMPTY_BALLOT';
  end if;
  if jsonb_array_length(p_choices) > 100 then raise exception 'BALLOT_TOO_LARGE'; end if;
  if p_idem is null or length(p_idem) < 16 or length(p_idem) > 100 then raise exception 'BAD_IDEMPOTENCY_KEY'; end if;

  select * into s from voter_sessions where token_hash = p_session_hash;
  if not found or s.revoked_at is not null or s.expires_at <= now() then
    raise exception 'SESSION_INVALID';
  end if;

  -- Serialise against status changes (pause/close) for the duration of this transaction.
  select * into e from elections where id = s.election_id for share;
  select * into v from voters where id = s.voter_id and election_id = e.id;
  if not found then raise exception 'NOT_ELIGIBLE'; end if;

  -- Serialise concurrent submissions from the same voter (tabs, retries, double clicks).
  perform pg_advisory_xact_lock(hashtextextended(v.id::text, 0));

  -- Idempotent replay: return exactly what was returned before.
  select * into existing from vote_submissions where voter_id = v.id and idempotency_key = p_idem;
  if found then
    return existing.result || jsonb_build_object('replayed', true);
  end if;

  if not app.election_accepting(e) then raise exception 'ELECTION_NOT_OPEN'; end if;

  receipt := 'VA-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4)) || '-' ||
                      upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4)) || '-' ||
                      upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4));

  -- Validate everything first; write nothing until the whole ballot is valid.
  for choice in select * from jsonb_array_elements(p_choices) loop
    begin
      select * into pos from positions where id = (choice->>'position_id')::uuid and election_id = e.id;
    exception when invalid_text_representation then raise exception 'INVALID_POSITION';
    end;
    if not found then raise exception 'INVALID_POSITION'; end if;
    if pos.id = any(seen) then raise exception 'DUPLICATE_POSITION_IN_BALLOT'; end if;
    seen := seen || pos.id;
    if not app.voter_eligible_for_position(v.voter_group, pos.eligible_groups) then
      raise exception 'NOT_ELIGIBLE_FOR_POSITION';
    end if;
    if jsonb_typeof(choice->'candidate_ids') <> 'array' then raise exception 'INVALID_CANDIDATE'; end if;
    begin
      select coalesce(array_agg(x::uuid), '{}') into cand_ids from jsonb_array_elements_text(choice->'candidate_ids') x;
    exception when invalid_text_representation then raise exception 'INVALID_CANDIDATE';
    end;
    if cardinality(cand_ids) = 0 then
      if not e.allow_abstain then raise exception 'ABSTAIN_NOT_ALLOWED'; end if;
    else
      if cardinality(cand_ids) > pos.max_selections then raise exception 'TOO_MANY_SELECTIONS'; end if;
      if (select count(distinct c) from unnest(cand_ids) c) <> cardinality(cand_ids) then
        raise exception 'DUPLICATE_CANDIDATE';
      end if;
      if (select count(*) from candidates c where c.id = any(cand_ids) and c.position_id = pos.id
            and c.election_id = e.id and c.status = 'active') <> cardinality(cand_ids) then
        raise exception 'INVALID_CANDIDATE';
      end if;
    end if;
  end loop;

  if e.require_all_positions then
    select count(*) into missing from positions p
     where p.election_id = e.id
       and app.voter_eligible_for_position(v.voter_group, p.eligible_groups)
       and not (p.id = any(seen))
       and not exists (select 1 from participations pa where pa.voter_id = v.id and pa.position_id = p.id);
    if missing > 0 then raise exception 'ALL_POSITIONS_REQUIRED'; end if;
  end if;

  insert into vote_submissions (id, election_id, college_id, voter_id, idempotency_key, receipt_code, result)
  values (sub_id, e.id, e.college_id, v.id, p_idem, receipt, '{}'::jsonb);

  -- Apply. The UNIQUE (election_id, voter_id, position_id) constraint decides; first committed wins.
  for choice in select * from jsonb_array_elements(p_choices) loop
    select * into pos from positions where id = (choice->>'position_id')::uuid;
    select coalesce(array_agg(x::uuid), '{}') into cand_ids from jsonb_array_elements_text(choice->'candidate_ids') x;

    insert into participations (election_id, college_id, position_id, voter_id, submission_id)
    values (e.id, e.college_id, pos.id, v.id, sub_id)
    on conflict on constraint participations_one_vote_per_position do nothing
    returning id into part_id;

    if part_id is null then
      out_items := out_items || jsonb_build_object('position_id', pos.id, 'status', 'already_voted');
    else
      accepted_n := accepted_n + 1;
      if cardinality(cand_ids) = 0 then
        insert into ballot.selections (election_id, position_id, candidate_id, voter_ref)
        values (e.id, pos.id, null, case when e.secret_ballot then null else v.id end);
      else
        foreach cid in array cand_ids loop
          insert into ballot.selections (election_id, position_id, candidate_id, voter_ref)
          values (e.id, pos.id, cid, case when e.secret_ballot then null else v.id end);
        end loop;
      end if;
      out_items := out_items || jsonb_build_object('position_id', pos.id, 'status', 'accepted');
    end if;
    part_id := null;
  end loop;

  if accepted_n = 0 then
    -- Nothing new accepted: do not issue a receipt for a no-op.
    delete from vote_submissions where id = sub_id;
    return jsonb_build_object('receipt', null, 'replayed', false, 'positions', out_items);
  end if;

  update vote_submissions
     set result = jsonb_build_object('receipt', receipt, 'replayed', false, 'positions', out_items)
   where id = sub_id;
  return jsonb_build_object('receipt', receipt, 'replayed', false, 'positions', out_items);
end $$;

-- Aggregate tally only. No row-level ballot data ever leaves the database.
create or replace function ballot.tally(p_election uuid)
returns table(position_id uuid, candidate_id uuid, votes bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.position_id, s.candidate_id, count(*)::bigint
    from ballot.selections s
   where s.election_id = p_election
   group by s.position_id, s.candidate_id
$$;

-- Open-ballot register — returns rows ONLY when the election is configured as a non-secret ballot.
create or replace function ballot.open_register(p_election uuid)
returns table(voter_email text, voter_name text, position_name text, candidate_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select v.email, v.name, p.name, coalesce(c.full_name, '(abstained)')
    from ballot.selections s
    join elections e on e.id = s.election_id and e.secret_ballot = false
    join voters v on v.id = s.voter_ref
    join positions p on p.id = s.position_id
    left join candidates c on c.id = s.candidate_id
   where s.election_id = p_election
   order by p.sort_order, v.email
$$;

-- Accepted ballots can never be edited or individually deleted.
create or replace function ballot.block_mutation() returns trigger language plpgsql as $$
begin
  if current_setting('ballot.purging', true) = 'on' then
    return old;
  end if;
  raise exception 'accepted ballots are immutable' using errcode = '42501';
end $$;
create trigger selections_immutable before update or delete on ballot.selections
  for each row execute function ballot.block_mutation();
create trigger participations_immutable before update or delete on participations
  for each row execute function ballot.block_mutation();
create trigger submissions_immutable before update on vote_submissions
  for each row when (old.result <> '{}'::jsonb) execute function ballot.block_mutation();

-- Published snapshots are immutable; they are removed only by the retention purge.
create trigger snapshots_immutable before update on result_snapshots
  for each row execute function app.append_only();
create or replace function app.snapshot_delete_guard() returns trigger language plpgsql as $$
begin
  if current_setting('ballot.purging', true) = 'on' then return old; end if;
  raise exception 'result snapshots can only be removed by the retention purge' using errcode = '42501';
end $$;
create trigger snapshots_delete_guard before delete on result_snapshots
  for each row execute function app.snapshot_delete_guard();

-- -----------------------------------------------------------------------------
-- Retention purge. Refuses unless the election is in 'retention' and purge_after has passed.
-- Removes personal data, ballots, sessions, imports, files; optionally keeps the public
-- aggregate snapshot. Returns per-table counts for the deletion receipt.
-- -----------------------------------------------------------------------------
create or replace function ballot.purge_election(p_election uuid, p_force_before_due boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e elections%rowtype;
  c jsonb := '{}'::jsonb;
  n bigint;
begin
  select * into e from elections where id = p_election for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.status = 'deleted' then return jsonb_build_object('already_deleted', true); end if;
  if e.status <> 'retention' then raise exception 'NOT_IN_RETENTION'; end if;
  if not p_force_before_due and (e.purge_after is null or e.purge_after > now()) then
    raise exception 'RETENTION_NOT_EXPIRED';
  end if;

  perform set_config('ballot.purging', 'on', true);

  delete from ballot.selections where election_id = e.id;     get diagnostics n = row_count; c := c || jsonb_build_object('ballot_selections', n);
  delete from participations where election_id = e.id;        get diagnostics n = row_count; c := c || jsonb_build_object('participations', n);
  delete from vote_submissions where election_id = e.id;      get diagnostics n = row_count; c := c || jsonb_build_object('vote_submissions', n);
  delete from voter_sessions where election_id = e.id;        get diagnostics n = row_count; c := c || jsonb_build_object('voter_sessions', n);
  delete from otp_challenges where election_id = e.id;        get diagnostics n = row_count; c := c || jsonb_build_object('otp_challenges', n);
  delete from voters where election_id = e.id;                get diagnostics n = row_count; c := c || jsonb_build_object('voters', n);
  delete from import_errors where import_id in (select id from voter_imports where election_id = e.id);
                                                              get diagnostics n = row_count; c := c || jsonb_build_object('import_errors', n);
  delete from voter_imports where election_id = e.id;         get diagnostics n = row_count; c := c || jsonb_build_object('voter_imports', n);
  delete from notifications where election_id = e.id;         get diagnostics n = row_count; c := c || jsonb_build_object('notifications', n);
  delete from candidates where election_id = e.id;            get diagnostics n = row_count; c := c || jsonb_build_object('candidates', n);
  delete from positions where election_id = e.id;             get diagnostics n = row_count; c := c || jsonb_build_object('positions', n);
  update security_events set details = '{}'::jsonb, ip_hash = null where election_id = e.id;
  get diagnostics n = row_count; c := c || jsonb_build_object('security_events_anonymized', n);

  if not e.keep_public_results then
    delete from publication_history where election_id = e.id;
    delete from result_snapshots where election_id = e.id;    get diagnostics n = row_count; c := c || jsonb_build_object('result_snapshots', n);
  end if;

  update elections
     set status = 'deleted', deleted_at = now(), description = null, banner = null, banner_mime = null,
         department = null
   where id = e.id;

  return c;
end $$;

-- Verification used by the cleanup job after a purge.
create or replace function ballot.purge_leftovers(p_election uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ballot_selections', (select count(*) from ballot.selections where election_id = p_election),
    'participations',    (select count(*) from participations where election_id = p_election),
    'voters',            (select count(*) from voters where election_id = p_election),
    'voter_sessions',    (select count(*) from voter_sessions where election_id = p_election),
    'otp_challenges',    (select count(*) from otp_challenges where election_id = p_election),
    'candidates_with_photos', (select count(*) from candidates where election_id = p_election),
    'banner',            (select count(*) from elections where id = p_election and banner is not null)
  )
$$;
