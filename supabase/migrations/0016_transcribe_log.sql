-- Lecture files to text (2026-09-28): one row per piece of audio transcribed, for the daily cap. No audio or text.
create table if not exists public.transcribe_log (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  seconds int not null,
  created_at timestamptz not null default now()
);
create index if not exists transcribe_log_user_time on public.transcribe_log (user_id, created_at);
alter table public.transcribe_log enable row level security;
-- Only the server function writes or reads it (service role); students get nothing.
