-- Foundations: accounts, tiers, usage, and every table the product needs, with row-level security on all of them.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.

-- ---------------------------------------------------------------- existing document tables (unchanged shape)
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

-- ---------------------------------------------------------------- profiles: tier, trial, onboarding, referral
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'plus', 'pro', 'max')),
  trial_ends_at timestamptz,
  grace_until timestamptz,
  stripe_customer_id text,
  referral_code text unique,
  referred_by uuid references auth.users (id),
  onboarding_step text,
  onboarding_done_at timestamptz,
  is_admin boolean not null default false,
  timezone text not null default 'America/Phoenix',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A profile row appears the moment a user signs up, already on the Max trial.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, tier, trial_ends_at, referral_code)
  values (new.id, 'free', now() + interval '7 days', encode(gen_random_bytes(4), 'hex'))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- terms (7, 8, and 15 week)
create table if not exists public.terms (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  weeks int not null check (weeks in (7, 8, 15, 16)),
  course_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- announcements and the read ledger
create table if not exists public.announcements (
  id text not null,
  user_id uuid not null default auth.uid(),
  course_id uuid not null,
  data jsonb not null,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.read_ledger (
  user_id uuid not null default auth.uid(),
  post_id text not null,
  hash text not null,
  read_at timestamptz not null default now(),
  summary text,
  action_count int not null default 0,
  primary key (user_id, post_id)
);

-- ---------------------------------------------------------------- AI usage: one row per call
create table if not exists public.usage_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  day date not null,
  kind text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_log_user_day_idx on public.usage_log (user_id, day);

-- ---------------------------------------------------------------- subscriptions (written only by the Stripe webhook)
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_subscription_id text unique,
  tier text not null check (tier in ('plus', 'pro', 'max')),
  interval text not null check (interval in ('month', 'year')),
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- notifications
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid(),
  morning_time time not null default '07:30',
  quiet_from time not null default '22:00',
  quiet_to time not null default '07:00',
  morning boolean not null default true,
  heavy_day boolean not null default true,
  not_started boolean not null default true,
  resync boolean not null default true,
  email boolean not null default false,
  updated_at timestamptz not null default now()
);
-- The client plans its own notifications (it has the schedule logic); the server only sends what is due.
create table if not exists public.notification_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  send_at timestamptz not null,
  kind text not null,
  title text not null,
  body text not null,
  url text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notification_plan_due_idx on public.notification_plan (send_at) where sent_at is null;

-- ---------------------------------------------------------------- onboarding funnel, referrals, feedback
create table if not exists public.onboarding_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  step text not null,
  event text not null check (event in ('enter', 'complete', 'skip')),
  platform text,
  at timestamptz not null default now()
);
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter uuid not null references auth.users (id) on delete cascade,
  invitee uuid not null references auth.users (id) on delete cascade,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (invitee)
);
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  screen text,
  text text not null,
  screenshot_path text,
  kind text not null default 'feedback' check (kind in ('feedback', 'bug')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- lectures: metadata, transcript and notes. Audio stays on the device.
create table if not exists public.recordings (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  course_id uuid not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- row-level security: every student sees only their own rows
do $$
declare t text;
begin
  foreach t in array array['courses','items','settings','profiles','terms','announcements','read_ledger','usage_log','subscriptions','push_subscriptions','notification_prefs','notification_plan','onboarding_events','referrals','feedback','recordings'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Own-rows policies. Tables the server writes on the user's behalf (usage_log, subscriptions, profiles.tier) are
-- read-only from the client: the Edge Functions use the service role, which bypasses RLS.
drop policy if exists "own courses" on public.courses;
create policy "own courses" on public.courses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own items" on public.items;
create policy "own items" on public.items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own terms" on public.terms;
create policy "own terms" on public.terms for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own announcements" on public.announcements;
create policy "own announcements" on public.announcements for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own ledger" on public.read_ledger;
create policy "own ledger" on public.read_ledger for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own push" on public.push_subscriptions;
create policy "own push" on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own prefs" on public.notification_prefs;
create policy "own prefs" on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own plan" on public.notification_plan;
create policy "own plan" on public.notification_plan for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own onboarding" on public.onboarding_events;
create policy "own onboarding" on public.onboarding_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own feedback" on public.feedback;
create policy "own feedback" on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "read own feedback" on public.feedback;
create policy "read own feedback" on public.feedback for select to authenticated using (user_id = auth.uid());
drop policy if exists "own recordings" on public.recordings;
create policy "own recordings" on public.recordings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Read-only from the client.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "update own profile prefs" on public.profiles;
create policy "update own profile prefs" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "read own usage" on public.usage_log;
create policy "read own usage" on public.usage_log for select to authenticated using (user_id = auth.uid());
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists "read own referrals" on public.referrals;
create policy "read own referrals" on public.referrals for select to authenticated using (inviter = auth.uid() or invitee = auth.uid());

-- The client must never be able to promote itself: tier, trial and admin are server-only columns.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.tier := old.tier;
    new.trial_ends_at := old.trial_ends_at;
    new.grace_until := old.grace_until;
    new.stripe_customer_id := old.stripe_customer_id;
    new.is_admin := old.is_admin;
    new.referral_code := old.referral_code;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns before update on public.profiles for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------- admin: aggregate views, readable only by admins
create or replace view public.admin_overview with (security_invoker = false) as
  select
    (select count(*) from public.profiles) as users,
    (select count(*) from public.profiles where tier = 'plus') as plus_users,
    (select count(*) from public.profiles where tier = 'pro') as pro_users,
    (select count(*) from public.profiles where tier = 'max') as max_users,
    (select count(*) from public.profiles where trial_ends_at > now()) as on_trial,
    (select count(*) from public.subscriptions where status = 'active') as paying,
    (select coalesce(sum(cost_usd), 0) from public.usage_log where day >= date_trunc('month', now())) as ai_cost_this_month;
revoke all on public.admin_overview from anon, authenticated;

-- ---------------------------------------------------------------- delete my account: everything, in one call
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.items where user_id = uid;
  delete from public.courses where user_id = uid;
  delete from public.settings where user_id = uid;
  delete from public.terms where user_id = uid;
  delete from public.announcements where user_id = uid;
  delete from public.read_ledger where user_id = uid;
  delete from public.usage_log where user_id = uid;
  delete from public.push_subscriptions where user_id = uid;
  delete from public.notification_prefs where user_id = uid;
  delete from public.notification_plan where user_id = uid;
  delete from public.onboarding_events where user_id = uid;
  delete from public.feedback where user_id = uid;
  delete from public.recordings where user_id = uid;
  delete from public.subscriptions where user_id = uid;
  delete from public.referrals where inviter = uid or invitee = uid;
  delete from public.profiles where user_id = uid;
  delete from auth.users where id = uid;
end $$;
