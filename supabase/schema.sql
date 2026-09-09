-- School Dashboard schema. Paste into the Supabase SQL editor and run once.
-- Rows are JSON documents keyed by the app's ids; deletions are tombstoned so
-- every device converges.

create table if not exists public.courses (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists public.items (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null
);

create index if not exists items_user_idx on public.items (user_id);
create index if not exists courses_user_idx on public.courses (user_id);

alter table public.courses enable row level security;
alter table public.items enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own courses" on public.courses;
drop policy if exists "own items" on public.items;
drop policy if exists "own settings" on public.settings;

create policy "own courses" on public.courses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items" on public.items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings" on public.settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
