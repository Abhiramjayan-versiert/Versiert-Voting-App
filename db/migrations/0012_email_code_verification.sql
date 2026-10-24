-- Optional second step for voters: a 6-digit code emailed to the address on the voter list.
-- Applies only while an email provider is configured; otherwise voters verify with email + student ID.
alter table elections add column require_email_code boolean not null default true;
