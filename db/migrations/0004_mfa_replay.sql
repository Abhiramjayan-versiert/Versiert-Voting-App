-- TOTP replay protection: remember the last accepted time-step per user.
alter table users add column if not exists mfa_last_counter bigint;
