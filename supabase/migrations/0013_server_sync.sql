-- George, 2026-09-28: a second way for the Sync Halo bookmark to deliver, for iPad and phones, where opening the
-- Halo+ tab replaces the Halo tab and the two tabs never talk. The bookmark drops the export into a pending slot on
-- the server with a per-account sync key; Halo+ picks it up on load and shows the normal review.
-- Everything here is OFF by default: nothing uses the server path until an admin turns it on for an account, or for
-- everyone. A kill switch turns it off for everyone at once, no deploy needed. Additive only.

-- ---------------------------------------------------------------- switches (admins only)
create table if not exists public.app_switches (
  name text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_switches enable row level security;
insert into public.app_switches (name, enabled) values ('server_sync_everyone', false), ('server_sync_kill', false)
  on conflict (name) do nothing;

-- Per account: an admin turns the server path on for George and chosen friends first.
alter table public.profiles add column if not exists server_sync boolean not null default false;

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
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Whether the server path is on for one account right now: never under the kill switch; otherwise for everyone
-- once that switch is on, or for this account alone.
create or replace function public.server_sync_on(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select enabled from public.app_switches where name = 'server_sync_kill'), false)
     and (coalesce((select enabled from public.app_switches where name = 'server_sync_everyone'), false)
          or coalesce((select server_sync from public.profiles where user_id = uid), false));
$$;

-- ---------------------------------------------------------------- the per-account sync key
-- The key rides inside the student's own bookmark. It can drop off a pending sync and nothing else: no read, no
-- delete, no other table. The student can read it (to build the bookmark) and reset it from You.
create table if not exists public.sync_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key text not null unique,
  created_at timestamptz not null default now()
);
alter table public.sync_keys enable row level security;
drop policy if exists sync_keys_own on public.sync_keys;
create policy sync_keys_own on public.sync_keys for select using (user_id = auth.uid());

create or replace function public.my_sync_key() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select key into k from public.sync_keys where user_id = me;
  if k is null then
    k := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.sync_keys (user_id, key) values (me, k) on conflict (user_id) do update set key = excluded.key;
  end if;
  return jsonb_build_object('key', k, 'enabled', public.server_sync_on(me));
end $$;
grant execute on function public.my_sync_key() to authenticated;

create or replace function public.reset_sync_key() returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.sync_keys (user_id, key) values (me, k) on conflict (user_id) do update set key = excluded.key, created_at = now();
  return jsonb_build_object('key', k, 'enabled', public.server_sync_on(me));
end $$;
grant execute on function public.reset_sync_key() to authenticated;

-- ---------------------------------------------------------------- the pending slot
-- Written only by the sync-drop function (service role). The student reads their own and marks it taken.
create table if not exists public.pending_syncs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  bytes integer not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists pending_syncs_user on public.pending_syncs (user_id, created_at desc);
alter table public.pending_syncs enable row level security;
drop policy if exists pending_syncs_own on public.pending_syncs;
create policy pending_syncs_own on public.pending_syncs for select using (user_id = auth.uid());

create or replace function public.take_pending_sync(sync_id uuid) returns void language sql security definer set search_path = public as $$
  update public.pending_syncs set consumed_at = coalesce(consumed_at, now()) where id = sync_id and user_id = auth.uid();
$$;
grant execute on function public.take_pending_sync(uuid) to authenticated;

-- ---------------------------------------------------------------- the admin panel
create or replace function public.admin_server_sync() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'everyone', coalesce((select enabled from public.app_switches where name = 'server_sync_everyone'), false),
    'kill', coalesce((select enabled from public.app_switches where name = 'server_sync_kill'), false),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'user_id', p.user_id) order by u.email)
                           from public.profiles p join auth.users u on u.id = p.user_id where p.server_sync), '[]'::jsonb),
    'pending_last_day', (select count(*) from public.pending_syncs where created_at > now() - interval '1 day'),
    'taken_last_day', (select count(*) from public.pending_syncs where consumed_at > now() - interval '1 day'));
end $$;
grant execute on function public.admin_server_sync() to authenticated;

create or replace function public.admin_set_switch(switch_name text, on_off boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  if switch_name not in ('server_sync_everyone', 'server_sync_kill') then raise exception 'unknown switch'; end if;
  update public.app_switches set enabled = on_off, updated_at = now(), updated_by = auth.uid() where name = switch_name;
end $$;
grant execute on function public.admin_set_switch(text, boolean) to authenticated;

create or replace function public.admin_set_server_sync(account_email text, on_off boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(account_email));
  if uid is null then return jsonb_build_object('ok', false, 'why', 'No account with that email.'); end if;
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set server_sync = on_off where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.admin_set_server_sync(text, boolean) to authenticated;
