-- 2026-10-22 (George): the free trial counts days of use, not calendar days. People synced once, disappeared, and their
-- week ran out before they really tried it.
--  * Max for 7 days of use. A day counts when the student opens Halo+ that day (Phoenix time), on any device, opening it
--    from the card on Halo's own page included; the extension syncing in the background does not count.
--  * It still starts at the first sync (0037 holds it until then). It ends at the end of the 7th day of use, and never
--    later than 30 days after the first sync.
--  * Auto-sync runs all trial long, on days of use or not (nothing here changes that).
--  * Today's trials are counted again from what each student really did (pages opened, steps taken, syncs taken in),
--    and never end earlier than they did before (trial_floor_at).
-- trial_ends_at stays the one answer to "when does it end", so plan gating, checkout, the intro offer and the end-of-trial
-- screen read exactly what they read before.

create table if not exists public.trial_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.trial_days enable row level security;

alter table public.profiles add column if not exists trial_days_used int not null default 0;
alter table public.profiles add column if not exists trial_floor_at timestamptz;

-- The trial's end from its days of use: the end of the 7th day (midnight after it, Phoenix), else 30 days after the
-- first sync, whichever is sooner; never before the floor; only while the trial is still on (an ended one stays ended).
create or replace function public.trial_recount(uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  tz constant text := 'America/Phoenix';
  first_day date;
  used int;
  seventh date;
  cap timestamptz;
  ends timestamptz;
begin
  select * into p from public.profiles where user_id = uid;
  if p.user_id is null or p.trial_started_at is null or p.trial_synced_at is null then return null; end if;
  first_day := (p.trial_synced_at at time zone tz)::date;
  select count(*) into used from public.trial_days where user_id = uid and day >= first_day;
  cap := p.trial_synced_at + interval '30 days';
  if used >= 7 then
    select day into seventh from public.trial_days where user_id = uid and day >= first_day order by day offset 6 limit 1;
    ends := least(cap, ((seventh + 1)::timestamp at time zone tz));
  else
    ends := cap;
  end if;
  ends := greatest(ends, coalesce(p.trial_floor_at, ends));
  perform set_config('halo.trusted', 'on', true);
  if p.trial_ends_at > now() and p.tier not in ('plus', 'max') and p.friend_from is null then
    update public.profiles set trial_days_used = used, trial_ends_at = ends where user_id = uid;
  else
    update public.profiles set trial_days_used = used where user_id = uid;
    ends := p.trial_ends_at;
  end if;
  return jsonb_build_object('used', used, 'ends_at', ends, 'cap_at', cap);
end $$;
revoke all on function public.trial_recount(uuid) from public, anon, authenticated;
grant execute on function public.trial_recount(uuid) to service_role;

-- Halo+ was opened today: today counts, once (the app asks on open and when the day turns).
create or replace function public.trial_touch() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
begin
  if me is null then return jsonb_build_object('ok', false, 'why', 'signed out'); end if;
  select * into p from public.profiles where user_id = me;
  if p.trial_synced_at is null or p.trial_ends_at is null or p.trial_ends_at <= now() or p.tier in ('plus', 'max') or p.friend_from is not null then
    return jsonb_build_object('ok', false, 'why', 'no trial running');
  end if;
  insert into public.trial_days (user_id, day) values (me, (now() at time zone 'America/Phoenix')::date) on conflict do nothing;
  return jsonb_build_object('ok', true) || coalesce(public.trial_recount(me), '{}'::jsonb);
end $$;
grant execute on function public.trial_touch() to authenticated;

-- The first sync starts the trial (0037); the day of it is the first day of use (the student is in Halo+ for it).
create or replace function public.trial_sync_started()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  first timestamptz;
  r jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where user_id = me;
  if p.user_id is null or p.trial_started_at is null then return jsonb_build_object('ok', false, 'why', 'no_trial'); end if;
  if p.trial_synced_at is not null then return jsonb_build_object('ok', false, 'why', 'already', 'ends_at', p.trial_ends_at); end if;
  if p.trial_ends_at is not null and p.trial_ends_at < now() then return jsonb_build_object('ok', false, 'why', 'ended'); end if;
  if not exists (select 1 from public.settings s where s.user_id = me and s.data->'lastPull'->>'at' is not null) then return jsonb_build_object('ok', false, 'why', 'not_synced'); end if;
  first := least(now(), coalesce(public.first_sync_at(me), now()));
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set trial_synced_at = first, trial_ends_at = greatest(coalesce(trial_ends_at, now()), first + interval '30 days') where user_id = me;
  insert into public.trial_days (user_id, day) values (me, (first at time zone 'America/Phoenix')::date), (me, (now() at time zone 'America/Phoenix')::date) on conflict do nothing;
  r := public.trial_recount(me);
  return jsonb_build_object('ok', true, 'ends_at', r->>'ends_at', 'used', r->'used');
end $$;
grant execute on function public.trial_sync_started() to authenticated;

-- The one trial email, now: the day after the 6th day of use ("1 day of Max left": the next open is the last), or two
-- days before the 30-day cap, whichever comes first. Same limits as before (one non-account email a week, unsubscribe).
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

-- Admin: every real trial, running or ended in the last two weeks: days of use, calendar days since the first sync, the end.
create or replace function public.admin_trials() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'who', split_part(u.email, '@', 1),
      'synced_at', p.trial_synced_at,
      'used', p.trial_days_used,
      'calendar', case when p.trial_synced_at is null then null else ((now() at time zone 'America/Phoenix')::date - (p.trial_synced_at at time zone 'America/Phoenix')::date) + 1 end,
      'ends_at', p.trial_ends_at,
      'cap_at', p.trial_synced_at + interval '30 days',
      'state', case when p.trial_ends_at <= now() then 'ended' when p.trial_synced_at is null then 'waiting for first sync' else 'running' end,
      'last_day', (select max(day) from public.trial_days d where d.user_id = p.user_id)
    ) order by p.trial_ends_at desc)
    from public.profiles p join auth.users u on u.id = p.user_id
    where p.trial_started_at is not null and p.tier not in ('plus', 'max') and p.friend_from is null
      and p.trial_ends_at > now() - interval '14 days'
      and not public.is_test_account(p.user_id) and not coalesce(p.is_admin, false)), '[]'::jsonb);
end $$;
grant execute on function public.admin_trials() to authenticated;

-- Today's trials, counted again from what each student really did since the first sync, never shorter than before.
insert into public.trial_days (user_id, day)
select distinct p.user_id, x.day
from public.profiles p,
lateral (
  select e.day from public.usage_events e where e.user_id = p.user_id and e.key like 'screen:%'
  union select (o.at at time zone 'America/Phoenix')::date from public.onboarding_events o where o.user_id = p.user_id
  union select (ps.consumed_at at time zone 'America/Phoenix')::date from public.pending_syncs ps where ps.user_id = p.user_id and ps.consumed_at is not null
) x(day)
where p.trial_started_at is not null and p.trial_synced_at is not null and p.trial_ends_at > now() and p.tier not in ('plus', 'max') and p.friend_from is null
  and x.day >= (p.trial_synced_at at time zone 'America/Phoenix')::date and x.day <= (now() at time zone 'America/Phoenix')::date
on conflict do nothing;
select set_config('halo.trusted', 'on', true);
update public.profiles set trial_floor_at = trial_ends_at
where trial_started_at is not null and trial_synced_at is not null and trial_ends_at > now() and tier not in ('plus', 'max') and friend_from is null and trial_floor_at is null;
select public.trial_recount(user_id) from public.profiles
where trial_started_at is not null and trial_synced_at is not null and trial_ends_at > now() and tier not in ('plus', 'max') and friend_from is null;
