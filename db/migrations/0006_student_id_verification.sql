-- Voters verify with college email + student ID (no email codes).
-- Student IDs are stored normalised (upper-case, no whitespace) and must be unique within an election.
update voters set student_id = nullif(upper(regexp_replace(student_id, '\s+', '', 'g')), '') where student_id is not null;
create unique index if not exists voters_election_student_id_uq on voters (election_id, student_id) where student_id is not null;
