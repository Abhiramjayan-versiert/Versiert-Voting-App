-- Voter-verifiable secret ballots.
--
-- Each ballot submission carries a random verification code generated in the voter's browser.
-- The code is stored ONLY next to the anonymous selections — never next to the voter, their
-- session, their submission or their confirmation code — so it lets a voter (and only someone
-- holding the code) confirm exactly how their ballot was recorded, while the database still
-- cannot link any ballot to a person.
--
-- The app passes the code for the current transaction via set_config('ballot.check_code', …, true);
-- the column default picks it up inside ballot.cast_votes, so the casting function is unchanged.

alter table ballot.selections
  add column check_code text
    default nullif(current_setting('ballot.check_code', true), '')
    constraint selections_check_code_format
      check (check_code is null or check_code ~ '^VC-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$');

create index selections_check_code_idx on ballot.selections(check_code) where check_code is not null;

-- Look up the choices recorded under one verification code (any election that has started).
create or replace function ballot.check_lookup(p_code text)
returns table(election_title text, college_name text, election_status text, position_name text, candidate_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.title, c.name, e.status, p.name, coalesce(cd.full_name, '(abstained)')
    from ballot.selections s
    join elections e on e.id = s.election_id
    join colleges c on c.id = e.college_id
    join positions p on p.id = s.position_id
    left join candidates cd on cd.id = s.candidate_id
   where s.check_code = p_code
   order by p.sort_order, p.name, cd.full_name
$$;

-- Anonymous ballot list for independent recounts — only once results are published.
-- Rows are ordered by the random code, so the order reveals nothing about who voted when.
create or replace function ballot.bulletin(p_election uuid)
returns table(check_code text, position_name text, candidate_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(s.check_code, '(no code)'), p.name, coalesce(cd.full_name, '(abstained)')
    from ballot.selections s
    join elections e on e.id = s.election_id and e.status in ('published', 'retention')
    join positions p on p.id = s.position_id
    left join candidates cd on cd.id = s.candidate_id
   where s.election_id = p_election
   order by s.check_code nulls last, p.sort_order, p.name, cd.full_name
$$;

revoke execute on function ballot.check_lookup(text) from public;
revoke execute on function ballot.bulletin(uuid) from public;
grant execute on function ballot.check_lookup(text) to vapp_app;
grant execute on function ballot.bulletin(uuid) to vapp_app;
