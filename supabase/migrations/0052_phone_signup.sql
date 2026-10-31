-- Loop 299 (2026-10-30): the phone screen as a sign-up (George). Phone sign-ups get their laptop link at once
-- (laptop-link, "we'll send one reminder"), and the one reminder is the existing 'finish_setup' email: once ever, a day
-- or more after a sign-up that never synced, with the usual limits (one non-account email a week, the unsubscribe).
-- 1. email_queue_tick: finish_setup carries where the account came from and how it signs in (meta src, acct), so the
--    reminder links the laptop page (Instagram counted, "Continue with Google" on the laptop).
-- 2. New signed-out/phone steps: 'email-signup' (sign up with email pressed), 'preview' (the Maya Torres preview opened),
--    'home-steps' (the Add to Home Screen steps shown), 'home-screen' (Halo+ opened from the Home Screen).
-- 3. admin_ig_funnel: those steps, and Instagram accounts by how they signed up (Google, Apple, email).

create or replace function public.email_queue_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  queued_trial int := 0;
  queued_sync int := 0;
  queued_setup int := 0;
  r record;
begin
  for r in
    select p.user_id, u.email, p.trial_ends_at, p.trial_days_used, p.trial_synced_at + interval '30 days' as cap_at,
           case when p.trial_days_used >= 7 then 'last-day' when p.trial_days_used = 6 then 'one-left' else 'cap' end as why
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where p.trial_started_at is not null
      and p.trial_synced_at is not null
      and p.trial_ends_at > now()
      and (p.trial_days_used >= 6 or p.trial_synced_at + interval '30 days' between now() + interval '24 hours' and now() + interval '60 hours')
      and p.tier not in ('plus', 'max')
      and p.friend_from is null
      and coalesce(p.is_admin, false) = false
      and coalesce(p.test_override, false) = false
      and coalesce(np.email, true) = true
      and u.email is not null
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind = 'trial_ending')
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind not in ('market_setup') and o.sent_at > now() - interval '7 days')
  loop
    insert into public.email_outbox (user_id, to_email, kind, meta) values (r.user_id, r.email, 'trial_ending', jsonb_build_object('why', r.why, 'ends_at', least(r.trial_ends_at, r.cap_at), 'cap_at', r.cap_at, 'used', r.trial_days_used)) on conflict (user_id, kind) do nothing;
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
    select p.user_id, u.email, p.signup_source, coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider
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
    insert into public.email_outbox (user_id, to_email, kind, meta) values (r.user_id, r.email, 'finish_setup', jsonb_build_object('src', r.signup_source, 'acct', r.provider)) on conflict (user_id, kind) do nothing;
    queued_setup := queued_setup + 1;
  end loop;
  return jsonb_build_object('trial_ending', queued_trial, 'sync_broken', queued_sync, 'finish_setup', queued_setup);
end $$;
revoke all on function public.email_queue_tick() from public, anon, authenticated;

alter table public.funnel_events drop constraint if exists funnel_events_via_check;
alter table public.funnel_events add constraint funnel_events_via_check check (via in ('share', 'copy', 'email', 'reminder', 'direct'));
alter table public.funnel_events drop constraint if exists funnel_events_step_check;
alter table public.funnel_events add constraint funnel_events_step_check check (step in ('visit', 'fold', 'email-focus', 'email', 'email-signup', 'share', 'copy', 'google', 'apple', 'safari', 'app', 'preview', 'home-steps', 'home-screen', 'laptop', 'laptop-store', 'welcome'));

create or replace function public.admin_ig_funnel(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with ev as (select * from public.funnel_events where src = 'ig' and at >= since),
    acc as (
      select p.user_id, u.created_at, p.trial_synced_at, coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider
      from public.profiles p join auth.users u on u.id = p.user_id
      where u.created_at >= since and public.is_real_student(p.user_id) and p.signup_source = 'ig'
    )
    select jsonb_build_object(
      'days', p_days,
      'visits', (select count(*) from ev where step = 'visit'),
      'visits_phone', (select count(*) from ev where step = 'visit' and device in ('phone', 'tablet')),
      'fold', (select count(*) from ev where step = 'fold'),
      'email_focus', (select count(*) from ev where step = 'email-focus'),
      'share', (select count(*) from ev where step = 'share'),
      'copy', (select count(*) from ev where step = 'copy'),
      'email', (select count(*) from ev where step = 'email'),
      'google', (select count(*) from ev where step = 'google'),
      'apple', (select count(*) from ev where step = 'apple'),
      'safari', (select count(*) from ev where step = 'safari'),
      'email_signup', (select count(*) from ev where step = 'email-signup'),
      'preview', (select count(*) from ev where step = 'preview'),
      'home_steps', (select count(*) from ev where step = 'home-steps'),
      'home_screen', (select count(*) from ev where step = 'home-screen'),
      'signed_up_google', (select count(*) from acc where provider = 'google'),
      'signed_up_apple', (select count(*) from acc where provider = 'apple'),
      'signed_up_email', (select count(*) from acc where provider = 'email'),
      'app', (select count(*) from ev where step = 'app'),
      'laptop', (select count(*) from ev where step = 'laptop'),
      'laptop_share', (select count(*) from ev where step = 'laptop' and via in ('share', 'copy')),
      'laptop_email', (select count(*) from ev where step = 'laptop' and via = 'email'),
      'laptop_reminder', (select count(*) from ev where step = 'laptop' and via = 'reminder'),
      'laptop_store', (select count(*) from ev where step = 'laptop-store'),
      'installed', (select count(*) from ev where step = 'welcome'),
      'signed_up', (select count(*) from acc),
      'signed_up_phone', (select count(*) from acc where provider in ('google', 'apple')),
      'first_sync', (select count(*) from acc where trial_synced_at is not null),
      'week_eligible', (select count(*) from acc where created_at <= now() - interval '7 days'),
      'week_later', (select count(*) from acc a where a.created_at <= now() - interval '7 days' and exists (
        select 1 from public.usage_events e where e.user_id = a.user_id and (e.key like 'screen:%' or e.key like 'halo:%') and e.day >= (a.created_at at time zone 'America/Phoenix')::date + 7)),
      'emails_sent', (select count(*) from public.laptop_links l where l.sent_at >= since and l.status = 'sent')
    )
  );
end $$;
revoke all on function public.admin_ig_funnel(int) from public, anon;
grant execute on function public.admin_ig_funnel(int) to authenticated;

-- 4. The phone screen's "Join 50+ GCU students": real students only (no test accounts, no admins), rounded down (to
--    10s under 100, 50s under 500, then 100s), so the number shown is always true. Only the rounded number leaves.
create or replace function public.public_student_count() returns int language sql stable security definer set search_path = public as $$
  with n as (select count(*)::int as n from public.profiles p where public.is_real_student(p.user_id))
  select case when n < 100 then (n / 10) * 10 when n < 500 then (n / 50) * 50 else (n / 100) * 100 end from n;
$$;
revoke all on function public.public_student_count() from public;
grant execute on function public.public_student_count() to anon, authenticated;
