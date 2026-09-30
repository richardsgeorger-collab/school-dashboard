-- George, 2026-09-29, overriding 0012: every new account gets Max free for 7 days, starting at sign-up. No button,
-- no card, once per account. Friend-link accounts are unchanged (claiming a link still ends the trial and grants
-- Max through the link's date). Referral rewards are queued, never wasted: a reward starts after the student's
-- free week and anything else already running, and a paying inviter's month pauses billing instead (the
-- referral-credit function does that at Stripe).

-- 1. The welcome gift.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, tier, trial_started_at, trial_ends_at, referral_code)
  values (new.id, 'free', now(), now() + interval '7 days', encode(extensions.gen_random_bytes(4), 'hex'))
  on conflict (user_id) do nothing;
  return new;
end $$;

-- 2. Queued rewards: a plan for a window that may start later.
create table if not exists public.reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('plus', 'max')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null,
  referral uuid references public.referrals (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reward_grants_user on public.reward_grants (user_id, ends_at);
alter table public.reward_grants enable row level security;
drop policy if exists "own grants" on public.reward_grants;
create policy "own grants" on public.reward_grants for select to authenticated using (user_id = auth.uid());

alter table public.referrals add column if not exists inviter_reward text;
alter table public.referrals add column if not exists inviter_applied_at timestamptz;

-- When a new reward for this account should start: after the free week, any reward running, any grant already
-- queued, and a subscription that is set to end. Never before now.
create or replace function public.reward_start(uid uuid) returns timestamptz language sql stable security definer set search_path = public as $$
  select greatest(
    now(),
    coalesce((select trial_ends_at from public.profiles where user_id = uid), now()),
    coalesce((select reward_until from public.profiles where user_id = uid), now()),
    coalesce((select max(ends_at) from public.reward_grants where user_id = uid), now()),
    coalesce((select current_period_end from public.subscriptions where user_id = uid and cancel_at_period_end and status in ('active', 'trialing', 'past_due')), now())
  );
$$;
revoke all on function public.reward_start(uuid) from public, anon, authenticated;

-- A paying subscriber whose plan keeps renewing: their month pauses billing (Stripe) instead of a queued grant.
create or replace function public.pays_now(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions where user_id = uid and not cancel_at_period_end and status in ('active', 'trialing', 'past_due'));
$$;
revoke all on function public.pays_now(uuid) from public, anon, authenticated;

-- 3. The one plan decider, with grants.
create or replace function public.plan_of(uid uuid) returns text language plpgsql stable security definer set search_path = public as $$
declare p public.profiles%rowtype; best int := 0; r int; g record; names text[] := array['free','plus','pro','max'];
begin
  select * into p from public.profiles where user_id = uid;
  if p.user_id is null then return 'free'; end if;
  best := coalesce(array_position(names, p.tier), 1) - 1;
  if p.trial_ends_at is not null and p.trial_ends_at > now() then best := greatest(best, 3); end if;
  if p.reward_tier is not null and p.reward_until is not null and p.reward_until > now() then
    r := coalesce(array_position(names, p.reward_tier), 1) - 1; best := greatest(best, r); end if;
  for g in select tier from public.reward_grants where user_id = uid and starts_at <= now() and ends_at > now() loop
    r := coalesce(array_position(names, g.tier), 1) - 1; best := greatest(best, r);
  end loop;
  if coalesce(p.is_admin, false) then best := 3; end if;
  return names[best + 1];
end $$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

-- 4. Invite a friend: both get 30 days of Plus, each queued after what they already have.
create or replace function public.claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inviter uuid;
  ref_id uuid;
  mine timestamptz;
  theirs timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  select user_id into inviter from public.profiles where referral_code = lower(trim(p_code));
  if inviter is null then return jsonb_build_object('ok', false, 'why', 'That invite code does not exist.'); end if;
  if inviter = me then return jsonb_build_object('ok', false, 'why', 'That is your own code.'); end if;
  if exists (select 1 from public.referrals where invitee = me) then return jsonb_build_object('ok', false, 'why', 'This account was already invited.'); end if;
  insert into public.referrals (inviter, invitee, rewarded_at) values (inviter, me, now()) returning id into ref_id;
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set referred_by = inviter where user_id = me;
  mine := public.reward_start(me);
  insert into public.reward_grants (user_id, tier, starts_at, ends_at, source, referral) values (me, 'plus', mine, mine + interval '30 days', 'referral:invitee', ref_id);
  if public.pays_now(inviter) then
    update public.referrals set inviter_reward = 'stripe_pause' where id = ref_id;
  else
    theirs := public.reward_start(inviter);
    insert into public.reward_grants (user_id, tier, starts_at, ends_at, source, referral) values (inviter, 'plus', theirs, theirs + interval '30 days', 'referral:inviter', ref_id);
    update public.referrals set inviter_reward = 'grant', inviter_applied_at = now() where id = ref_id;
  end if;
  return jsonb_build_object('ok', true, 'starts', mine, 'ends', mine + interval '30 days');
end $$;
grant execute on function public.claim_referral(text) to authenticated;

-- 5. "2 friends joined. You've earned 60 days of Plus."
create or replace function public.my_referrals() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'joined', (select count(*) from public.referrals where inviter = auth.uid()),
    'days', 30 * (select count(*) from public.referrals where inviter = auth.uid()),
    'next_starts', (select min(starts_at) from public.reward_grants where user_id = auth.uid() and starts_at > now()),
    'running_until', (select max(ends_at) from public.reward_grants where user_id = auth.uid() and starts_at <= now() and ends_at > now()),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('tier', tier, 'starts', starts_at, 'ends', ends_at, 'source', source) order by starts_at) from public.reward_grants where user_id = auth.uid() and ends_at > now()), '[]'::jsonb)
  );
$$;
grant execute on function public.my_referrals() to authenticated;

-- 6. George's funnel for new accounts: signed up, synced, notifications, checklist, active days 2/4/7, invited a
-- friend, chose a plan at the end, and how many came through a referral.
create or replace function public.admin_funnel(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with new_users as (
      select p.user_id, u.created_at, p.referred_by, p.tier, p.trial_ends_at, p.friend_link
        from public.profiles p join auth.users u on u.id = p.user_id
       where u.created_at >= since and u.email not like '%@example.invalid'
    ),
    s as (
      select n.*,
        exists (select 1 from public.settings st where st.user_id = n.user_id and st.data ? 'lastPull') as synced,
        exists (select 1 from public.push_subscriptions ps where ps.user_id = n.user_id) as notified,
        exists (select 1 from public.settings st where st.user_id = n.user_id and st.data -> 'welcomeList' ? 'doneAt') as checklist,
        exists (select 1 from public.usage_events e where e.user_id = n.user_id and e.day = (n.created_at at time zone 'utc')::date + 1) as d2,
        exists (select 1 from public.usage_events e where e.user_id = n.user_id and e.day = (n.created_at at time zone 'utc')::date + 3) as d4,
        exists (select 1 from public.usage_events e where e.user_id = n.user_id and e.day = (n.created_at at time zone 'utc')::date + 6) as d7,
        exists (select 1 from public.referrals r where r.inviter = n.user_id) as invited,
        (n.trial_ends_at is not null and n.trial_ends_at <= now()) as ended,
        (n.tier in ('plus', 'pro', 'max') or exists (select 1 from public.subscriptions sb where sb.user_id = n.user_id)) as paid
      from new_users n
    )
    select jsonb_build_object(
      'days', p_days,
      'signed_up', count(*),
      'from_referrals', count(*) filter (where referred_by is not null),
      'from_friend_links', count(*) filter (where friend_link is not null),
      'synced', count(*) filter (where synced),
      'notifications', count(*) filter (where notified),
      'checklist', count(*) filter (where checklist),
      'day2', count(*) filter (where d2),
      'day4', count(*) filter (where d4),
      'day7', count(*) filter (where d7),
      'invited', count(*) filter (where invited),
      'trial_ended', count(*) filter (where ended),
      'chose_plan', count(*) filter (where ended and paid)
    ) from s
  );
end $$;
grant execute on function public.admin_funnel(int) to authenticated;
