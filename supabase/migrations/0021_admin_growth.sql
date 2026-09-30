-- The Admin page's growth numbers (George, 2026-09-30, launch day): real students only, one definition for each number.
--   - An account is TEST when George marks it (test_override), or else automatically: George's own addresses and any
--     +alias of them (the reviewer account included), and every test-script account (@example.invalid).
--   - Every account is in exactly one plan bucket (plan_bucket below), in this order: Max (paid), Plus (paid), Max
--     (friend link), Free trial (Max, 7 days), Plus (referral credit), Free.
--   - "Signed up" is auth.users.created_at (profiles.created_at was not the sign-up time for older accounts).

alter table public.profiles add column if not exists test_override boolean;

-- Students cannot change it; only the admin functions below (trusted) can.
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
    new.legacy_sync_until := old.legacy_sync_until;
    new.friend_link := old.friend_link;
    new.friend_from := old.friend_from;
    new.friend_joined_at := old.friend_joined_at;
    new.server_sync := old.server_sync;
    new.test_override := old.test_override;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Test by rule (George's addresses and their +aliases, test scripts), unless George set it by hand.
create or replace function public.test_by_rule(email text) returns boolean language sql immutable as $$
  select coalesce(email ~* '^richards\.georger(\+[^@]*)?@(gmail|icloud)\.com$' or email ~* '@example\.invalid$', false);
$$;

create or replace function public.is_test_account(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.test_override from public.profiles p where p.user_id = uid), public.test_by_rule((select u.email from auth.users u where u.id = uid)), false);
$$;
revoke all on function public.is_test_account(uuid) from public, anon, authenticated;

-- Exactly one plan per account, the same everywhere on the Admin page.
create or replace function public.plan_bucket(uid uuid) returns text language sql stable security definer set search_path = public as $$
  with p as (select * from public.profiles where user_id = uid),
  sub as (select tier from public.subscriptions where user_id = uid and status in ('active', 'trialing', 'past_due') limit 1),
  paid as (select coalesce((select tier from sub), (select case when tier in ('plus', 'pro', 'max') then tier end from p)) as tier),
  grant_now as (select tier from public.reward_grants where user_id = uid and starts_at <= now() and ends_at > now())
  select case
    when (select tier from paid) = 'max' then 'max_paid'
    when (select tier from paid) in ('plus', 'pro') then 'plus_paid'
    when (select reward_tier = 'max' and reward_until > now() from p) or exists (select 1 from grant_now where tier = 'max') then 'max_friend'
    when (select trial_ends_at > now() from p) then 'trial'
    when (select reward_tier in ('plus', 'pro') and reward_until > now() from p) or exists (select 1 from grant_now where tier = 'plus') then 'plus_referral'
    else 'free'
  end;
$$;
revoke all on function public.plan_bucket(uuid) from public, anon, authenticated;

-- Growth at a glance: real students only. Days are Phoenix days (GCU's time zone).
create or replace function public.admin_growth() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz text := 'America/Phoenix';
  today date := (now() at time zone tz)::date;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with real as (
      select u.id, u.created_at, (u.created_at at time zone tz)::date as day, public.plan_bucket(u.id) as bucket
        from auth.users u join public.profiles p on p.user_id = u.id
       where not public.is_test_account(u.id)
    ),
    active as (select e.user_id, max(e.day) as last from public.usage_events e where e.user_id in (select id from real) group by e.user_id),
    paying as (select s.tier, s.interval from public.subscriptions s where s.user_id in (select id from real) and s.status in ('active', 'trialing', 'past_due'))
    select jsonb_build_object(
      'today', today,
      'total', (select count(*) from real),
      'new_today', (select count(*) from real where day = today),
      'new_week', (select count(*) from real where day > today - 7),
      'active_today', (select count(*) from active where last >= today - 1 and last >= (now() at time zone 'utc')::date),
      'active_week', (select count(*) from active where last > (now() at time zone 'utc')::date - 7),
      'plans', (select coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb) from (select bucket, count(*) n from real group by bucket) b),
      'paying', (select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'interval', interval)), '[]'::jsonb) from paying),
      'per_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', (select count(*) from real where day = d)) order by d), '[]'::jsonb)
                    from generate_series(today - 29, today, interval '1 day') g(d0), lateral (select g.d0::date as d) x),
      'tests', (select count(*) from auth.users u where public.is_test_account(u.id))
    )
  );
end $$;
grant execute on function public.admin_growth() to authenticated;

-- Every account, newest first, real and test, with what the list shows.
create or replace function public.admin_accounts() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.created_at desc) from (
      select u.id, u.email, u.created_at,
             case when p.referred_by is not null then 'referral' when p.friend_link is not null then 'friend link' else 'direct' end as source,
             public.plan_bucket(u.id) as plan,
             exists (select 1 from public.settings s where s.user_id = u.id and s.data ? 'lastPull') as synced,
             (select count(*) from public.courses c where c.user_id = u.id and c.deleted_at is null) as classes,
             greatest(u.last_sign_in_at, (select (max(e.day) + interval '12 hours')::timestamptz from public.usage_events e where e.user_id = u.id)) as last_active,
             public.is_test_account(u.id) as test,
             public.test_by_rule(u.email) as test_by_rule,
             p.test_override
        from auth.users u join public.profiles p on p.user_id = u.id
       order by u.created_at desc
       limit 2000
    ) t), '[]'::jsonb);
end $$;
grant execute on function public.admin_accounts() to authenticated;

-- George's Test toggle: true or false by hand, null back to the rule.
create or replace function public.admin_set_test(uid uuid, test boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set test_override = case when test is null or test = public.test_by_rule((select email from auth.users where id = uid)) then null else test end where user_id = uid;
end $$;
grant execute on function public.admin_set_test(uuid, boolean) to authenticated;

-- The signup funnel: the same real-students rule as everything else (it used to drop only @example.invalid).
create or replace function public.admin_funnel(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with new_users as (
      select p.user_id, u.created_at, p.referred_by, p.tier, p.trial_ends_at, p.friend_link
        from public.profiles p join auth.users u on u.id = p.user_id
       where u.created_at >= since and not public.is_test_account(u.id)
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
        public.plan_bucket(n.user_id) in ('plus_paid', 'max_paid') as paid
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

-- The older numbers the page still shows (onboarding steps, syncs, feedback, AI spend): steps and syncs are real
-- students only; AI spend stays every account, since it is money spent. The People/Trials numbers are gone from the
-- page (Growth replaces them) and from here.
create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'not an admin'; end if;
  return jsonb_build_object(
    'ai_cost_month', (select coalesce(sum(cost_usd), 0) from public.usage_log where day >= date_trunc('month', now())::date),
    'ai_calls_month', (select count(*) from public.usage_log where day >= date_trunc('month', now())::date),
    'funnel', (select coalesce(jsonb_agg(jsonb_build_object('step', step, 'event', event, 'n', n)), '[]'::jsonb)
                 from (select step, event, count(distinct user_id) n from public.onboarding_events where step <> 'sync' and not public.is_test_account(user_id) group by step, event) f),
    'syncs_7d', (select coalesce(jsonb_object_agg(coalesce(platform, 'unknown'), n), '{}'::jsonb)
                   from (select platform, count(*) n from public.onboarding_events where step = 'sync' and at > now() - interval '7 days' and not public.is_test_account(user_id) group by platform) s),
    'syncing_users_30d', (select count(distinct user_id) from public.onboarding_events where step = 'sync' and at > now() - interval '30 days' and not public.is_test_account(user_id)),
    'phone_only_syncers', (select count(*) from (select user_id from public.onboarding_events where step = 'sync' and at > now() - interval '30 days' and not public.is_test_account(user_id) group by user_id having bool_and(platform = 'phone')) p),
    'feedback_open', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'screen', screen, 'text', text, 'screenshot_path', screenshot_path, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
                        from (select * from public.feedback where resolved_at is null order by created_at desc limit 50) fb)
  );
end $$;
