-- The plans George set on 2026-09-28 (src/config/tiers.ts): Halo sync moves to Plus, the Max trial is seven days and
-- starts on its own at signup, plans are sold monthly or by the semester. Additive and safe to run more than once.

-- ---------------------------------------------------------------- the trial starts at signup, once per account
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, tier, trial_started_at, trial_ends_at, referral_code)
  values (new.id, 'free', now(), now() + interval '7 days', encode(extensions.gen_random_bytes(4), 'hex'))
  on conflict (user_id) do nothing;
  return new;
end $$;

-- Kept for accounts made before the trial started itself: seven days, once.
create or replace function public.start_trial()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  ends timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where user_id = me;
  if p.user_id is null then raise exception 'no profile'; end if;
  if p.tier = 'max' then return jsonb_build_object('ok', false, 'why', 'already_max'); end if;
  if p.trial_started_at is not null then return jsonb_build_object('ok', false, 'why', 'used', 'ended_at', p.trial_ends_at); end if;
  ends := now() + interval '7 days';
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set trial_started_at = now(), trial_ends_at = ends where user_id = me;
  return jsonb_build_object('ok', true, 'ends_at', ends);
end $$;
grant execute on function public.start_trial() to authenticated;

-- ---------------------------------------------------------------- existing free syncers keep sync to term end
alter table public.profiles add column if not exists legacy_sync_until timestamptz;
alter table public.profiles add column if not exists legacy_notice_seen_at timestamptz;

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
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Anyone on no plan and no live trial who already has a class linked to Halo keeps sync until the day after their
-- latest class ends (fall 2026 at the latest by default). Runs once; a later run changes nothing already set.
update public.profiles p
set legacy_sync_until = coalesce(
  (select (max((c.data->>'termEnd')::date) + 1)::timestamptz from public.courses c
    where c.user_id = p.user_id and c.deleted_at is null and c.data->>'haloClassId' is not null and c.data->>'termEnd' ~ '^\d{4}-\d{2}-\d{2}$'),
  '2026-12-21'::timestamptz)
where p.legacy_sync_until is null
  and p.tier in ('free')
  and (p.trial_ends_at is null or p.trial_ends_at < now())
  and exists (select 1 from public.courses c where c.user_id = p.user_id and c.deleted_at is null and c.data->>'haloClassId' is not null);

-- The one-time notice is marked seen through this, since the column is the student's own to set.
create or replace function public.mark_legacy_notice_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set legacy_notice_seen_at = coalesce(legacy_notice_seen_at, now()) where user_id = auth.uid();
$$;
grant execute on function public.mark_legacy_notice_seen() to authenticated;

-- ---------------------------------------------------------------- semester billing
alter table public.subscriptions drop constraint if exists subscriptions_interval_check;
alter table public.subscriptions add constraint subscriptions_interval_check check (interval in ('month', 'year', 'semester'));
