-- 2026-10-09 (George): the trial clock, and the two emails a student may get.
-- 1. trial_sync_started(): the free week is worth nothing until Halo is connected (6 of 23 trials never synced), so
--    when the first sync lands the week restarts from then, never past 14 days from the start.
-- 2. notification_prefs.email: on by default (it was never shown and never true), with the moment of unsubscribing kept.
-- 3. email_queue_tick(): every hour, the two emails: the day before a free week ends (one), and a sync that has been
--    broken for three days (one, then nothing until it is fixed and breaks again). At most one such email a week per
--    student; never to anyone who unsubscribed; account emails (setup, resets, receipts) are not counted.

alter table public.profiles add column if not exists trial_synced_at timestamptz;

create or replace function public.trial_sync_started()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  ends timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where user_id = me;
  if p.user_id is null or p.trial_started_at is null then return jsonb_build_object('ok', false, 'why', 'no_trial'); end if;
  if p.trial_synced_at is not null then return jsonb_build_object('ok', false, 'why', 'already', 'ends_at', p.trial_ends_at); end if;
  if not exists (select 1 from public.settings s where s.user_id = me and s.data->'lastPull'->>'at' is not null) then return jsonb_build_object('ok', false, 'why', 'not_synced'); end if;
  ends := greatest(coalesce(p.trial_ends_at, now()), least(now() + interval '5 days', p.trial_started_at + interval '14 days'));
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set trial_synced_at = now(), trial_ends_at = ends where user_id = me;
  return jsonb_build_object('ok', true, 'ends_at', ends);
end $$;
grant execute on function public.trial_sync_started() to authenticated;

alter table public.notification_prefs alter column email set default true;
alter table public.notification_prefs add column if not exists email_unsub_at timestamptz;
-- Never shown in the app before today: a false here is the old default, not a choice.
update public.notification_prefs set email = true where email = false and email_unsub_at is null;

alter table public.email_outbox add column if not exists meta jsonb not null default '{}'::jsonb;

create or replace function public.email_queue_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  queued_trial int := 0;
  queued_sync int := 0;
  r record;
begin
  -- The day before the free week ends: between 12 and 36 hours out, once.
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

  -- Halo not heard from for three days on an account whose plan syncs: once, until it is fixed and breaks again
  -- (sync-drop removes the row when a sync lands).
  for r in
    select p.user_id, u.email, (s.data->'lastPull'->>'at')::timestamptz as last_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    join public.settings s on s.user_id = p.user_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where s.data->'lastPull'->>'at' is not null
      and (s.data->'lastPull'->>'at')::timestamptz < now() - interval '3 days'
      and (p.tier in ('plus', 'max') or coalesce(p.trial_ends_at, '-infinity') > now() or coalesce(p.reward_until, '-infinity') > now())
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
  return jsonb_build_object('trial_ending', queued_trial, 'sync_broken', queued_sync);
end $$;
revoke all on function public.email_queue_tick() from public, anon, authenticated;

select cron.unschedule('email-queue') where exists (select 1 from cron.job where jobname = 'email-queue');
select cron.schedule('email-queue', '17 * * * *', 'select public.email_queue_tick()');
