-- 2026-10-13 (George: "most new signups never sync"). Where a new account drops between sign-up and its first sync,
-- for Admin, from real data; and one gentle "finish setup" email.
--
-- 1. onboarding_events carry the device ("phone", "tablet", "laptop") and browser each step happened on.
-- 2. admin_signup_funnel(days): every real account made in the window, step by step: the device and browser it signed
--    up on (from its first step; before today, from its first sign-in's browser), reached the connect step, pressed
--    Add to Chrome, the extension found, Halo opened, chose "Finish on my laptop", came back on a laptop, a sync landed,
--    and the classes it has now.
-- 3. email_queue_tick(): also queues 'finish_setup', once ever, for an account made 24 hours to 14 days ago that has
--    never synced, can still sync (its free week or a plan is on), and has had no "finish setup" email (requested or
--    not). It counts toward the same limits: never within seven days of another non-account email, never after an
--    unsubscribe, and only while the student has had fewer than two such emails in all.

alter table public.onboarding_events add column if not exists device text;
alter table public.onboarding_events add column if not exists browser text;

create or replace function public.ua_device(ua text) returns text language sql immutable as $$
  select case when ua is null then null
    when ua ~* 'iPad' then 'tablet'
    when ua ~* 'iPhone|iPod' then 'phone'
    when ua ~* 'Android' and ua ~* 'Mobile' then 'phone'
    when ua ~* 'Android' then 'tablet'
    when ua ~* 'Mobile' then 'phone'
    else 'laptop' end
$$;

create or replace function public.ua_browser(ua text) returns text language sql immutable as $$
  select case when ua is null then null
    when ua ~ 'CriOS/' then 'Chrome iOS'
    when ua ~ 'FxiOS/' then 'Firefox iOS'
    when ua ~ 'EdgiOS/' then 'Edge iOS'
    when ua ~ 'Ddg/' then 'DuckDuckGo'
    when ua ~ 'SamsungBrowser/' then 'Samsung'
    when ua ~ 'OPR/|Opera' then 'Opera'
    when ua ~ 'Edg/' then 'Edge'
    when ua ~ 'Firefox/' then 'Firefox'
    when ua ~ 'Chrome/' then 'Chrome'
    when ua ~ 'Safari/' then 'Safari'
    else 'Other' end
$$;

create or replace function public.admin_signup_funnel(p_days int default 14) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  rows jsonb;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  with acct as (
    select u.id, u.email, u.created_at, p.trial_synced_at
    from auth.users u join public.profiles p on p.user_id = u.id
    where u.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 14), 90)))
      and not public.is_test_account(u.id) and not coalesce(p.is_admin, false)
  ), ev as (
    select e.user_id, e.step, e.event, e.at, e.device, e.browser, e.platform from public.onboarding_events e where e.user_id in (select id from acct)
  ), per as (
    select a.id, split_part(a.email, '@', 1) as who, a.created_at,
      coalesce(
        (select e.device from ev e where e.user_id = a.id and e.device is not null order by e.at limit 1),
        (select public.ua_device(s.user_agent) from auth.sessions s where s.user_id = a.id and s.user_agent is not null order by s.created_at limit 1),
        (select case when e.platform = 'phone' then 'phone' else 'laptop' end from ev e where e.user_id = a.id order by e.at limit 1)) as device,
      coalesce(
        (select e.browser from ev e where e.user_id = a.id and e.browser is not null order by e.at limit 1),
        (select public.ua_browser(s.user_agent) from auth.sessions s where s.user_id = a.id and s.user_agent is not null order by s.created_at limit 1)) as browser,
      exists (select 1 from ev e where e.user_id = a.id and (e.step like 'halo%' or e.step like 'connect%' or e.step like 'ext-setup-%' or e.step = 'market-handoff')) as reached_connect,
      exists (select 1 from ev e where e.user_id = a.id and ((e.step = 'halo:ext-wait' and e.event = 'enter') or e.step in ('ext-setup-store', 'connect:store'))) as clicked_store,
      exists (select 1 from ev e where e.user_id = a.id and e.step in ('halo:ext-connected', 'ext-setup-connected', 'connect:ext-found'))
        or exists (select 1 from public.settings s where s.user_id = a.id and s.data->'lastPull'->>'via' = 'extension')
        or exists (select 1 from public.pending_syncs ps where ps.user_id = a.id and ps.payload->>'source' = 'extension') as installed,
      exists (select 1 from ev e where e.user_id = a.id and e.event = 'complete' and e.step in ('halo:open', 'halo:p-open', 'halo:i-test', 'connect:halo')) as opened_halo,
      exists (select 1 from ev e where e.user_id = a.id and e.event = 'complete' and e.step in ('connect:handoff', 'market-handoff')) as handoff,
      exists (select 1 from ev e where e.user_id = a.id and coalesce(e.device, case when e.platform = 'desktop' then 'laptop' end) = 'laptop') as on_laptop,
      (a.trial_synced_at is not null
        or exists (select 1 from public.courses c where c.user_id = a.id)
        or exists (select 1 from public.pending_syncs ps where ps.user_id = a.id)
        or exists (select 1 from public.settings s where s.user_id = a.id and s.data->'lastPull'->>'at' is not null)) as landed,
      (select count(*) from public.courses c where c.user_id = a.id and c.deleted_at is null) as classes_now,
      (select max(e.at) from ev e where e.user_id = a.id) as last_step_at
    from acct a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'who', who, 'created_at', created_at, 'device', coalesce(device, 'unknown'), 'browser', coalesce(browser, 'unknown'),
      'reached_connect', reached_connect or landed, 'clicked_store', clicked_store, 'installed', installed,
      'opened_halo', opened_halo or landed, 'handoff', handoff, 'on_laptop', on_laptop, 'landed', landed,
      'classes_now', classes_now, 'last_step_at', last_step_at) order by created_at desc), '[]'::jsonb)
    into rows from per;
  return jsonb_build_object('days', p_days, 'accounts', rows);
end $$;
grant execute on function public.admin_signup_funnel(int) to authenticated;

create or replace function public.email_queue_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  queued_trial int := 0;
  queued_sync int := 0;
  queued_setup int := 0;
  r record;
begin
  for r in
    select p.user_id, u.email, p.trial_ends_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where p.trial_started_at is not null
      and p.trial_ends_at between now() + interval '12 hours' and now() + interval '36 hours'
      and p.tier not in ('plus', 'max')
      and p.friend_from is null
      and coalesce(p.is_admin, false) = false
      and coalesce(p.test_override, false) = false
      and coalesce(np.email, true) = true
      and u.email is not null
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind = 'trial_ending')
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind not in ('market_setup') and o.sent_at > now() - interval '7 days')
  loop
    insert into public.email_outbox (user_id, to_email, kind, meta) values (r.user_id, r.email, 'trial_ending', jsonb_build_object('ends_at', r.trial_ends_at)) on conflict (user_id, kind) do nothing;
    queued_trial := queued_trial + 1;
  end loop;

  -- Paying Plus and Max only.
  for r in
    select p.user_id, u.email, (s.data->'lastPull'->>'at')::timestamptz as last_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    join public.settings s on s.user_id = p.user_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where s.data->'lastPull'->>'at' is not null
      and (s.data->'lastPull'->>'at')::timestamptz < now() - interval '3 days'
      and p.tier in ('plus', 'max')
      and exists (select 1 from public.subscriptions sub where sub.user_id = p.user_id and sub.status in ('active', 'trialing', 'past_due'))
      and coalesce(p.is_admin, false) = false
      and coalesce(p.test_override, false) = false
      and coalesce(np.email, true) = true
      and u.email is not null
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind = 'sync_broken')
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind not in ('market_setup') and o.sent_at > now() - interval '7 days')
  loop
    insert into public.email_outbox (user_id, to_email, kind, meta) values (r.user_id, r.email, 'sync_broken', jsonb_build_object('last_at', r.last_at, 'days', floor(extract(epoch from (now() - r.last_at)) / 86400))) on conflict (user_id, kind) do nothing;
    queued_sync := queued_sync + 1;
  end loop;

  -- Signed up a day ago or more and never synced: one "finish setup on your laptop" email, ever.
  for r in
    select p.user_id, u.email
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where u.created_at between now() - interval '14 days' and now() - interval '24 hours'
      and (p.tier in ('plus', 'max') or p.trial_ends_at > now())
      and p.trial_synced_at is null
      and not public.is_test_account(p.user_id)
      and coalesce(p.is_admin, false) = false
      and coalesce(np.email, true) = true
      and u.email is not null
      and not exists (select 1 from public.courses c where c.user_id = p.user_id)
      and not exists (select 1 from public.pending_syncs ps where ps.user_id = p.user_id)
      and not exists (select 1 from public.settings s where s.user_id = p.user_id and s.data->'lastPull'->>'at' is not null)
      and not exists (select 1 from public.onboarding_events e where e.user_id = p.user_id and e.step = 'sync' and e.event = 'complete')
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind in ('market_setup', 'finish_setup'))
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind not in ('market_setup') and o.sent_at > now() - interval '7 days')
      and (select count(*) from public.email_outbox o where o.user_id = p.user_id and o.kind not in ('market_setup')) < 2
  loop
    insert into public.email_outbox (user_id, to_email, kind) values (r.user_id, r.email, 'finish_setup') on conflict (user_id, kind) do nothing;
    queued_setup := queued_setup + 1;
  end loop;
  return jsonb_build_object('trial_ending', queued_trial, 'sync_broken', queued_sync, 'finish_setup', queued_setup);
end $$;
revoke all on function public.email_queue_tick() from public, anon, authenticated;
