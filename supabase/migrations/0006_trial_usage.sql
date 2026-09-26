-- The free 5-day Max trial, started on purpose and once per account, and privacy-respecting usage counts.
-- Safe to run more than once.

-- ---------------------------------------------------------------- trial: one per account, tracked here
alter table public.profiles add column if not exists trial_started_at timestamptz;

-- New accounts no longer start on a trial. The trial is offered at the payoff moment and started with one tap.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, tier, trial_ends_at, referral_code)
  values (new.id, 'free', null, encode(extensions.gen_random_bytes(4), 'hex'))
  on conflict (user_id) do nothing;
  return new;
end $$;

-- The client may never touch the plan columns, except through the two server functions below, which set a flag
-- for the length of their own transaction.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' and coalesce(current_setting('halo.trusted', true), '') <> 'on' then
    new.tier := old.tier;
    new.trial_ends_at := old.trial_ends_at;
    new.trial_started_at := old.trial_started_at;
    new.grace_until := old.grace_until;
    new.stripe_customer_id := old.stripe_customer_id;
    new.is_admin := old.is_admin;
    new.referral_code := old.referral_code;
    new.referred_by := old.referred_by;
    new.reward_tier := old.reward_tier;
    new.reward_until := old.reward_until;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Start the trial: five days of Max, no card, once per account. Returns the state so the client can say why not.
create or replace function public.start_trial()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  ends timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where user_id = me;
  if p.user_id is null then raise exception 'no profile'; end if;
  if p.tier = 'max' then return jsonb_build_object('ok', false, 'why', 'already_max'); end if;
  if p.trial_started_at is not null then return jsonb_build_object('ok', false, 'why', 'used', 'ended_at', p.trial_ends_at); end if;
  ends := now() + interval '5 days';
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set trial_started_at = now(), trial_ends_at = ends where user_id = me;
  return jsonb_build_object('ok', true, 'ends_at', ends);
end $$;
grant execute on function public.start_trial() to authenticated;

-- ---------------------------------------------------------------- usage counts: which screens and buttons get used
-- One row per user, day and key, a count and nothing else. No text, no titles, no identifiers of anything a
-- student did with their work; only that a screen was opened or a button pressed.
create table if not exists public.usage_events (
  user_id uuid not null default auth.uid(),
  day date not null default (now() at time zone 'utc')::date,
  key text not null,
  n int not null default 0,
  primary key (user_id, day, key)
);
alter table public.usage_events enable row level security;
drop policy if exists "own usage" on public.usage_events;
create policy "own usage" on public.usage_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Several keys at once, so the client can batch what it counted while offline.
create or replace function public.bump_usage(p_keys text[], p_counts int[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  i int;
begin
  if me is null then return; end if;
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    if p_keys[i] !~ '^[a-z0-9_.:-]{1,64}$' then continue; end if;
    insert into public.usage_events (user_id, day, key, n) values (me, (now() at time zone 'utc')::date, p_keys[i], greatest(1, coalesce(p_counts[i], 1)))
    on conflict (user_id, day, key) do update set n = public.usage_events.n + excluded.n;
  end loop;
end $$;
grant execute on function public.bump_usage(text[], int[]) to authenticated;

-- What gets used, for admins: totals per key over the last 14 days and how many people used it.
create or replace function public.admin_usage()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ok boolean;
begin
  select is_admin into ok from public.profiles where user_id = me;
  if not coalesce(ok, false) then raise exception 'not an admin'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'n', n, 'people', people) order by n desc), '[]'::jsonb)
            from (select key, sum(n) n, count(distinct user_id) people from public.usage_events where day > (now() at time zone 'utc')::date - 14 group by key) u);
end $$;
grant execute on function public.admin_usage() to authenticated;

-- The admin overview counts trials started, not only trials running.
create or replace function public.admin_trials()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ok boolean;
begin
  select is_admin into ok from public.profiles where user_id = me;
  if not coalesce(ok, false) then raise exception 'not an admin'; end if;
  return jsonb_build_object(
    'started', (select count(*) from public.profiles where trial_started_at is not null),
    'running', (select count(*) from public.profiles where trial_ends_at > now()),
    'ended', (select count(*) from public.profiles where trial_started_at is not null and trial_ends_at <= now()),
    'converted', (select count(*) from public.profiles p where p.trial_started_at is not null and exists (select 1 from public.subscriptions s where s.user_id = p.user_id and s.status in ('active', 'trialing', 'past_due')))
  );
end $$;
grant execute on function public.admin_trials() to authenticated;
