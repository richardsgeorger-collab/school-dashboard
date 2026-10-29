-- Two plans, Free and Max (George, 2026-10-29). Plus and Pro are retired: no longer sold, and every old Plus or Pro
-- row (a plan, a reward, an invite grant) counts as Max, so nobody who has one loses anything. An invite gives both
-- students 30 days of Max. Where a student paid from (the app, the extension's popup, a Halo page) is kept for Admin.

-- 1. The plan: Plus and Pro count as Max.
create or replace function public.plan_of(uid uuid) returns text language plpgsql stable security definer set search_path = public as $$
declare p public.profiles%rowtype; best int := 0; r int; g record;
begin
  select * into p from public.profiles where user_id = uid;
  if p.user_id is null then return 'free'; end if;
  best := case when p.tier in ('plus', 'pro', 'max') then 1 else 0 end;
  if p.trial_ends_at is not null and p.trial_ends_at > now() then best := 1; end if;
  if p.reward_tier in ('plus', 'pro', 'max') and p.reward_until is not null and p.reward_until > now() then best := 1; end if;
  for g in select tier from public.reward_grants where user_id = uid and starts_at <= now() and ends_at > now() loop
    if g.tier in ('plus', 'pro', 'max') then best := 1; end if;
  end loop;
  if coalesce(p.is_admin, false) then best := 1; end if;
  return case when best = 1 then 'max' else 'free' end;
end $$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

-- 2. Invite a friend: both get 30 days of Max (it was Plus), each queued after what they already have.
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
  insert into public.reward_grants (user_id, tier, starts_at, ends_at, source, referral) values (me, 'max', mine, mine + interval '30 days', 'referral:invitee', ref_id);
  if public.pays_now(inviter) then
    update public.referrals set inviter_reward = 'stripe_pause' where id = ref_id;
  else
    theirs := public.reward_start(inviter);
    insert into public.reward_grants (user_id, tier, starts_at, ends_at, source, referral) values (inviter, 'max', theirs, theirs + interval '30 days', 'referral:inviter', ref_id);
    update public.referrals set inviter_reward = 'grant', inviter_applied_at = now() where id = ref_id;
  end if;
  return jsonb_build_object('ok', true, 'starts', mine, 'ends', mine + interval '30 days');
end $$;
grant execute on function public.claim_referral(text) to authenticated;

-- 3. Admin's plan groups: Free and Max only (an old Plus or Pro one is Max).
create or replace function public.plan_bucket(uid uuid) returns text language sql stable security definer set search_path = public as $$
  with p as (select * from public.profiles where user_id = uid),
  sub as (select tier from public.subscriptions where user_id = uid and status in ('active', 'trialing', 'past_due') limit 1),
  paid as (select coalesce((select tier from sub), (select case when tier in ('plus', 'pro', 'max') then tier end from p)) as tier),
  grant_now as (select tier from public.reward_grants where user_id = uid and starts_at <= now() and ends_at > now())
  select case
    when (select tier from paid) in ('plus', 'pro', 'max') then 'max_paid'
    when (select reward_tier in ('plus', 'pro', 'max') and reward_until > now() and friend_from is not null from p) then 'max_friend'
    when (select trial_ends_at > now() from p) then 'trial'
    when (select reward_tier in ('plus', 'pro', 'max') and reward_until > now() from p) or exists (select 1 from grant_now) then 'max_referral'
    else 'free'
  end;
$$;

-- 4. Where a student paid from (the checkout's source), the first payment's.
alter table public.profiles add column if not exists paid_via text check (paid_via in ('app', 'popup', 'halo'));
alter table public.profiles add column if not exists paid_via_at timestamptz;

-- 5. Admin: paying students by where they paid from.
create or replace function public.admin_paid_via() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    select jsonb_build_object(
      'app', count(*) filter (where p.paid_via = 'app'),
      'popup', count(*) filter (where p.paid_via = 'popup'),
      'halo', count(*) filter (where p.paid_via = 'halo'),
      'unknown', count(*) filter (where p.paid_via is null)
    )
    from public.profiles p
    where exists (select 1 from public.subscriptions s where s.user_id = p.user_id and s.status in ('active', 'trialing', 'past_due') and s.stripe_subscription_id not like 'sub_audit_%')
  );
end $$;
grant execute on function public.admin_paid_via() to authenticated;

-- Locked announcement changes (2026-10-29): the extension's heads-up is on the assignment's page now (halo:locked-box,
-- "Unlock with Max" is halo:locked-unlock); the pill's old peek (halo:locked-peek) still counts for the weeks before.
create or replace function public.admin_locked_changes() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with seen as (
      select e.user_id, min(e.day) as first_day
      from public.usage_events e
      where e.key in ('locked:seen', 'halo:locked-peek', 'halo:locked-box') and public.is_real_student(e.user_id)
      group by 1
    )
    select jsonb_build_object(
      'saw', (select count(*) from seen),
      'clicked', (select count(distinct e.user_id) from public.usage_events e join seen s on s.user_id = e.user_id where e.key in ('locked:click', 'halo:locked-unlock')),
      'upgraded', (select count(*) from seen s join public.subscriptions sub on sub.user_id = s.user_id
                   where sub.status in ('active', 'trialing', 'past_due') and sub.tier in ('plus', 'pro', 'max') and sub.updated_at::date >= s.first_day
                     and sub.stripe_subscription_id not like 'sub_audit_%')
    )
  );
end $$;
grant execute on function public.admin_locked_changes() to authenticated;

-- Where a student paid from is the server's to write (the checkout webhook), never the student's.
create or replace function public.protect_profile_columns() returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' and coalesce(current_setting('halo.trusted', true), '') <> 'on' then
    new.tier := old.tier;
    new.trial_ends_at := old.trial_ends_at;
    new.trial_started_at := old.trial_started_at;
    new.trial_synced_at := old.trial_synced_at;
    new.trial_days_used := old.trial_days_used;
    new.trial_floor_at := old.trial_floor_at;
    new.trial_last_day := old.trial_last_day;
    new.grace_until := old.grace_until;
    new.stripe_customer_id := old.stripe_customer_id;
    new.is_admin := old.is_admin;
    new.referral_code := old.referral_code;
    new.referred_by := old.referred_by;
    new.reward_tier := old.reward_tier;
    new.reward_until := old.reward_until;
    new.legacy_sync_until := old.legacy_sync_until;
    new.friend_link := old.friend_link;
    new.friend_from := old.friend_from;
    new.friend_joined_at := old.friend_joined_at;
    new.server_sync := old.server_sync;
    new.test_override := old.test_override;
    new.paid_via := old.paid_via;
    new.paid_via_at := old.paid_via_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
