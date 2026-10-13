-- 2026-10-13 (George): the free Max week starts at the first sync, not at sign-up. Server only; the app already reads
-- trial_ends_at for the days left.
--
-- * Before an account's first sync its week does not run down: trial_hold_tick() keeps it at a full seven days
--   (every 30 minutes). A sign-up that syncs a week later still gets all seven days.
-- * At the first sync, trial_sync_started() sets the end to exactly seven days from that sync (the old rule restarted
--   it at five days and capped it at fourteen from sign-up). A week that has already ended is never restarted.
-- * Live weeks today: synced ones end seven days from their first sync (only ever later than now); never-synced ones are
--   held. Weeks that already ended are left as they are.

-- When an account first synced: the earliest of the first sync it recorded, the first one delivered to it, and its
-- last-synced time (all that is known for a sync from before 2026-10-09).
create or replace function public.first_sync_at(uid uuid) returns timestamptz language sql stable security definer set search_path = public as $$
  select least(
    (select min(e.at) from public.onboarding_events e where e.user_id = uid and e.step = 'sync' and e.event = 'complete'),
    (select min(ps.created_at) from public.pending_syncs ps where ps.user_id = uid),
    (select (s.data->'lastPull'->>'at')::timestamptz from public.settings s where s.user_id = uid and s.data->'lastPull'->>'at' is not null))
$$;
revoke all on function public.first_sync_at(uuid) from public, anon, authenticated;

-- Never synced: no recorded first sync, no Halo sync stamp, nothing delivered.
create or replace function public.never_synced(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.settings s where s.user_id = uid and s.data->'lastPull'->>'at' is not null)
     and not exists (select 1 from public.pending_syncs ps where ps.user_id = uid)
     and not exists (select 1 from public.courses c where c.user_id = uid and c.deleted_at is null and c.data->>'haloClassId' is not null)
$$;
revoke all on function public.never_synced(uuid) from public, anon, authenticated;

create or replace function public.trial_sync_started()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  first timestamptz;
  ends timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where user_id = me;
  if p.user_id is null or p.trial_started_at is null then return jsonb_build_object('ok', false, 'why', 'no_trial'); end if;
  if p.trial_synced_at is not null then return jsonb_build_object('ok', false, 'why', 'already', 'ends_at', p.trial_ends_at); end if;
  if p.trial_ends_at is not null and p.trial_ends_at < now() then return jsonb_build_object('ok', false, 'why', 'ended'); end if;
  if not exists (select 1 from public.settings s where s.user_id = me and s.data->'lastPull'->>'at' is not null) then return jsonb_build_object('ok', false, 'why', 'not_synced'); end if;
  first := least(now(), coalesce(public.first_sync_at(me), now()));
  ends := greatest(coalesce(p.trial_ends_at, now()), first + interval '7 days');
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set trial_synced_at = first, trial_ends_at = ends where user_id = me;
  return jsonb_build_object('ok', true, 'ends_at', ends);
end $$;
grant execute on function public.trial_sync_started() to authenticated;

-- The hold: a live free week on an account that has never synced stays at seven days.
create or replace function public.trial_hold_tick() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('halo.trusted', 'on', true);
  update public.profiles p set trial_ends_at = now() + interval '7 days'
  where p.trial_started_at is not null
    and p.trial_synced_at is null
    and p.trial_ends_at > now()
    and p.trial_ends_at < now() + interval '7 days'
    and p.tier not in ('plus', 'max')
    and p.friend_from is null
    and public.never_synced(p.user_id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.trial_hold_tick() from public, anon, authenticated;

select cron.unschedule('trial-hold') where exists (select 1 from cron.job where jobname = 'trial-hold');
select cron.schedule('trial-hold', '*/30 * * * *', 'select public.trial_hold_tick()');

-- Today's live weeks.
select set_config('halo.trusted', 'on', true);
-- Synced (before the first-sync clock, or missed by the app asking too early): seven days from the first sync.
update public.profiles p set
    trial_synced_at = coalesce(p.trial_synced_at, public.first_sync_at(p.user_id)),
    trial_ends_at = greatest(p.trial_ends_at, coalesce(p.trial_synced_at, public.first_sync_at(p.user_id)) + interval '7 days')
where p.trial_started_at is not null
  and p.trial_ends_at > now()
  and p.tier not in ('plus', 'max')
  and p.friend_from is null
  and not public.never_synced(p.user_id)
  and coalesce(p.trial_synced_at, public.first_sync_at(p.user_id)) is not null;
-- Never synced: held at seven days from now.
select public.trial_hold_tick();
