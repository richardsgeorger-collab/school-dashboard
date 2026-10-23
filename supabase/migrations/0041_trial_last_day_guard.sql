-- Loop 249, two follow-ups to 0040 (George, 2026-10-22: the free trial in days of use).
-- 1. trial_last_day: the last day of use counted (Phoenix). With it the app knows whether today is already one of the
--    days used, so "Max · N days left" does not read 7 and then 6 a second later on the first open of a day.
-- 2. The trial columns the client must never write: trial_synced_at decides the 30-day limit trial_touch recounts the
--    end from, so a student moving it forward could stretch their own trial. The same guard as tier and trial_ends_at.

alter table public.profiles add column if not exists trial_last_day date;

create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
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
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.trial_recount(uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  tz constant text := 'America/Phoenix';
  first_day date;
  used int;
  last_day date;
  seventh date;
  cap timestamptz;
  ends timestamptz;
begin
  select * into p from public.profiles where user_id = uid;
  if p.user_id is null or p.trial_started_at is null or p.trial_synced_at is null then return null; end if;
  first_day := (p.trial_synced_at at time zone tz)::date;
  select count(*), max(day) into used, last_day from public.trial_days where user_id = uid and day >= first_day;
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
    update public.profiles set trial_days_used = used, trial_last_day = last_day, trial_ends_at = ends where user_id = uid;
  else
    update public.profiles set trial_days_used = used, trial_last_day = last_day where user_id = uid;
    ends := p.trial_ends_at;
  end if;
  return jsonb_build_object('used', used, 'last_day', last_day, 'ends_at', ends, 'cap_at', cap);
end $$;
revoke all on function public.trial_recount(uuid) from public, anon, authenticated;
grant execute on function public.trial_recount(uuid) to service_role;

-- Backfill: the last counted day for everyone with days of use.
select set_config('halo.trusted', 'on', true);
update public.profiles p set trial_last_day = d.last_day
from (select t.user_id, max(t.day) as last_day from public.trial_days t join public.profiles q on q.user_id = t.user_id
      where q.trial_synced_at is not null and t.day >= (q.trial_synced_at at time zone 'America/Phoenix')::date group by t.user_id) d
where p.user_id = d.user_id;
