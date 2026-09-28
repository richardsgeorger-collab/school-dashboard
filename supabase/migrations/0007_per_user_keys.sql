-- Course and item ids are derived from Halo's own ids on purpose (a re-sync must find the same rows), which means
-- two students in the same Halo section produce the same ids. Keyed by id alone, the second student's upsert hit
-- the first student's row, failed row-level security, and their classes never reached their account. The key is
-- now (user_id, id): the same Halo assignment is a different row for each student. No data moves or is lost.
alter table public.courses drop constraint if exists courses_pkey;
alter table public.courses add primary key (user_id, id);
alter table public.items drop constraint if exists items_pkey;
alter table public.items add primary key (user_id, id);
