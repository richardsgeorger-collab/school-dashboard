-- Loop 268 (2026-10-25): Free kept current, Web Store installs, and the numbers George decides plans with.
-- 1. ext_installs: one row per browser that installed the extension (the extension's own device id), where it came from
--    ('store': no Halo+ tab was open, so the Chrome Web Store; 'site': from Halo+'s own setup), and the account it was
--    later linked to (its first sync key). Written only by the report function (service role).
-- 2. set_signup_source takes 'store' (the welcome tab after a Web Store install) as well as 'market'.
-- 3. Admin: trials ending, Free still opening a week later, locked announcement changes and upgrades, the Web Store
--    funnel, and users per feature per week. Real students only (no test accounts, no admins), Phoenix days.

create table if not exists public.ext_installs (
  device_id text primary key,
  installed_at timestamptz not null default now(),
  source text not null check (source in ('store', 'site')),
  ext_version text,
  browser text,
  user_id uuid references auth.users (id) on delete set null,
  linked_at timestamptz
);
alter table public.ext_installs enable row level security;
create index if not exists ext_installs_user on public.ext_installs (user_id);

create or replace function public.set_signup_source(p_source text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if p_source not in ('market', 'store') then return false; end if;
  update public.profiles set signup_source = p_source where user_id = auth.uid() and signup_source is null;
  return found;
end $$;
revoke all on function public.set_signup_source(text) from public, anon;
grant execute on function public.set_signup_source(text) to authenticated;

-- Real students: not a test account, not an admin.
create or replace function public.is_real_student(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_test_account(uid) and not coalesce((select is_admin from public.profiles where user_id = uid), false);
$$;
revoke all on function public.is_real_student(uuid) from public, anon, authenticated;

-- Has this student used the extension: a sync run from it, or a sync that came through it.
create or replace function public.has_extension(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sync_runs r where r.user_id = uid)
    or exists (select 1 from public.ext_installs i where i.user_id = uid)
    or coalesce((select s.data -> 'lastPull' ->> 'via' = 'extension' from public.settings s where s.user_id = uid), false);
$$;
revoke all on function public.has_extension(uuid) from public, anon, authenticated;

-- Trials ending in the next 7 days, by Phoenix day; and where the trials that ended in the last 30 days went.
create or replace function public.admin_trials_ending() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare tz constant text := 'America/Phoenix';
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'next', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'n', d.n) order by d.day)
      from (
        select (p.trial_ends_at at time zone tz)::date as day, count(*) as n
        from public.profiles p
        where p.trial_ends_at > now() and p.trial_ends_at <= now() + interval '7 days' and p.tier not in ('plus', 'pro', 'max') and p.friend_from is null
          and p.trial_synced_at is not null and public.is_real_student(p.user_id)
        group by 1
      ) d), '[]'::jsonb),
    'ended', coalesce((
      select jsonb_object_agg(b.bucket, b.n)
      from (
        select public.plan_bucket(p.user_id) as bucket, count(*) as n
        from public.profiles p
        where p.trial_ends_at <= now() and p.trial_ends_at > now() - interval '30 days' and p.trial_synced_at is not null and p.friend_from is null
          and public.is_real_student(p.user_id)
        group by 1
      ) b), '{}'::jsonb)
  );
end $$;
grant execute on function public.admin_trials_ending() to authenticated;

-- Free students whose trial ended at least a week ago (within 60 days): how many still opened Halo+ (any screen) or
-- used it on Halo a week or more after the end, with and without the extension.
create or replace function public.admin_free_retention() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare tz constant text := 'America/Phoenix';
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_object_agg(g.grp, jsonb_build_object('total', g.total, 'opening', g.opening))
    from (
      select case when public.has_extension(p.user_id) then 'extension' else 'no_extension' end as grp,
        count(*) as total,
        count(*) filter (where exists (
          select 1 from public.usage_events e
          where e.user_id = p.user_id and (e.key like 'screen:%' or e.key like 'halo:%') and e.day >= (p.trial_ends_at at time zone tz)::date + 7
        )) as opening
      from public.profiles p
      where p.trial_ends_at <= now() - interval '7 days' and p.trial_ends_at > now() - interval '60 days' and p.trial_synced_at is not null
        and public.plan_bucket(p.user_id) = 'free' and public.is_real_student(p.user_id)
      group by 1
    ) g), '{}'::jsonb);
end $$;
grant execute on function public.admin_free_retention() to authenticated;

-- "An announcement changed the due date · see it with Plus": who saw one, who pressed it, who is on Plus or Max now
-- with a subscription that started (or changed) on or after the first one they saw.
create or replace function public.admin_locked_changes() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with seen as (
      select e.user_id, min(e.day) as first_day
      from public.usage_events e
      where e.key in ('locked:seen', 'halo:locked-peek') and public.is_real_student(e.user_id)
      group by 1
    )
    select jsonb_build_object(
      'saw', (select count(*) from seen),
      'clicked', (select count(distinct e.user_id) from public.usage_events e join seen s on s.user_id = e.user_id where e.key = 'locked:click'),
      'upgraded', (select count(*) from seen s join public.subscriptions sub on sub.user_id = s.user_id
                   where sub.status in ('active', 'trialing', 'past_due') and sub.tier in ('plus', 'pro', 'max') and sub.updated_at::date >= s.first_day),
      'upgraded_plus', (select count(*) from seen s join public.subscriptions sub on sub.user_id = s.user_id
                   where sub.status in ('active', 'trialing', 'past_due') and sub.tier in ('plus', 'pro') and sub.updated_at::date >= s.first_day),
      'upgraded_max', (select count(*) from seen s join public.subscriptions sub on sub.user_id = s.user_id
                   where sub.status in ('active', 'trialing', 'past_due') and sub.tier = 'max' and sub.updated_at::date >= s.first_day)
    )
  );
end $$;
grant execute on function public.admin_locked_changes() to authenticated;

-- Web Store installs as their own funnel, over p_days: installed, signed up (linked to an account, or an account made from
-- the welcome tab), first sync, still using it a week after signing up (of those old enough to tell).
create or replace function public.admin_store_funnel(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with acc as (
      select p.user_id, u.created_at, p.trial_synced_at
      from public.profiles p join auth.users u on u.id = p.user_id
      where u.created_at >= since and public.is_real_student(p.user_id)
        and (p.signup_source = 'store' or exists (select 1 from public.ext_installs i where i.user_id = p.user_id and i.source = 'store'))
    )
    select jsonb_build_object(
      'days', p_days,
      'installs', (select count(*) from public.ext_installs i where i.source = 'store' and i.installed_at >= since and (i.user_id is null or public.is_real_student(i.user_id))),
      'site_installs', (select count(*) from public.ext_installs i where i.source = 'site' and i.installed_at >= since and (i.user_id is null or public.is_real_student(i.user_id))),
      'signed_up', (select count(*) from acc),
      'first_sync', (select count(*) from acc where trial_synced_at is not null),
      'week_eligible', (select count(*) from acc where created_at <= now() - interval '7 days'),
      'week_later', (select count(*) from acc a where a.created_at <= now() - interval '7 days' and exists (
        select 1 from public.usage_events e where e.user_id = a.user_id and (e.key like 'screen:%' or e.key like 'halo:%') and e.day >= (a.created_at at time zone 'America/Phoenix')::date + 7))
    )
  );
end $$;
grant execute on function public.admin_store_funnel(int) to authenticated;

-- Users per feature per week (Phoenix weeks from Monday), split by where each student stood that day: on the trial,
-- paid (Plus or Max, paid or a reward), or Free. Which usage keys make each feature is listed here and nowhere else.
create or replace function public.admin_feature_usage(p_weeks int default 4) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    with f(feature, pattern) as (values
      ('now', 'screen:now'), ('classes', 'screen:classes'), ('classes', 'screen:class'), ('calendar', 'screen:calendar'),
      ('study', 'screen:study'), ('study', 'screen:practice'), ('ask', 'screen:ask'), ('help_kit', 'helpkit:%'),
      ('changes_viewed', 'ann-change:view'), ('changes_viewed', 'locked:seen'), ('extension_panel', 'halo:week-%'),
      ('pill_clicks', 'halo:pill-click'), ('gpa', 'gpa:open')
    ),
    rows as (
      select date_trunc('week', e.day::timestamp)::date as week, f.feature, e.user_id,
        case
          when p.tier in ('plus', 'pro', 'max') or (p.reward_tier is not null and p.reward_until::date >= e.day) then 'paid'
          when p.trial_synced_at is not null and (p.trial_ends_at at time zone 'America/Phoenix')::date >= e.day then 'trial'
          else 'free'
        end as grp
      from public.usage_events e
      join f on e.key like f.pattern
      join public.profiles p on p.user_id = e.user_id
      where e.day >= (date_trunc('week', (now() at time zone 'America/Phoenix')::date::timestamp) - make_interval(weeks => p_weeks - 1))::date
        and public.is_real_student(e.user_id)
    ),
    counted as (
      select week, feature, grp, count(distinct user_id) as n from rows group by 1, 2, 3
    ),
    by_week as (
      select week, jsonb_object_agg(feature || ':' || grp, n) as cells from counted group by 1
    )
    select jsonb_agg(jsonb_build_object('week', week, 'cells', cells) order by week desc) from by_week
  ), '[]'::jsonb);
end $$;
grant execute on function public.admin_feature_usage(int) to authenticated;
