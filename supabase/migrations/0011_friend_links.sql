-- Friend links (2026-09-28): George hands Halo+ to friends for free. A link grants Max through a date he sets (the end
-- of the current term by default), with a use limit and an off switch. Only admins make or read links; a friend claims
-- one once, signed in. Additive and safe to run more than once.

create table if not exists public.friend_links (
  code text primary key,
  created_by uuid not null references auth.users (id) on delete cascade,
  label text,
  from_name text not null default 'George',
  max_uses int not null default 10 check (max_uses > 0),
  active boolean not null default true,
  until timestamptz not null,
  created_at timestamptz not null default now()
);
-- No policies: nobody reads or writes the table directly; the functions below are the only way in.
alter table public.friend_links enable row level security;

alter table public.profiles add column if not exists friend_link text references public.friend_links (code) on delete set null;
alter table public.profiles add column if not exists friend_from text;
alter table public.profiles add column if not exists friend_joined_at timestamptz;

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
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.is_admin_me() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false);
$$;

-- Make a link. Admin only. Returns its code.
create or replace function public.create_friend_link(p_label text, p_max_uses int, p_until timestamptz, p_from_name text)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  code := encode(extensions.gen_random_bytes(5), 'hex');
  insert into public.friend_links (code, created_by, label, max_uses, until, from_name)
  values (code, auth.uid(), nullif(trim(p_label), ''), greatest(1, coalesce(p_max_uses, 10)), p_until, coalesce(nullif(trim(p_from_name), ''), 'George'));
  return code;
end $$;

-- Turn a link on or off. Admin only. Off stops new claims; friends already in keep their Max to its date.
create or replace function public.set_friend_link_active(p_code text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  update public.friend_links set active = p_active where code = p_code;
end $$;

-- Every link with who joined through it, and whether they finished onboarding and synced. Admin only.
create or replace function public.list_friend_links()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', l.code, 'label', l.label, 'from_name', l.from_name, 'max_uses', l.max_uses, 'active', l.active, 'until', l.until, 'created_at', l.created_at,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'email', u.email,
          'joined_at', p.friend_joined_at,
          'onboarded', p.onboarding_done_at is not null or exists (select 1 from public.onboarding_events e where e.user_id = p.user_id and e.step in ('payoff', 'done') and e.event = 'complete'),
          'synced', exists (select 1 from public.onboarding_events e where e.user_id = p.user_id and e.step = 'sync' and e.event = 'complete')
                    or exists (select 1 from public.courses c where c.user_id = p.user_id and c.deleted_at is null and c.data->>'haloClassId' is not null)
        ) order by p.friend_joined_at)
        from public.profiles p join auth.users u on u.id = p.user_id where p.friend_link = l.code), '[]'::jsonb)
    ) order by l.created_at desc)
    from public.friend_links l where l.created_by = auth.uid()), '[]'::jsonb);
end $$;

-- A friend claims a link once, signed in: Max through the link's date, the trial countdown stopped (the trial stays
-- used, so it never comes back as an offer).
create or replace function public.claim_friend_link(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  l public.friend_links%rowtype;
  used int;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into l from public.friend_links where code = lower(trim(p_code));
  if l.code is null then return jsonb_build_object('ok', false, 'why', 'That link does not exist.'); end if;
  if exists (select 1 from public.profiles where user_id = me and friend_link is not null) then return jsonb_build_object('ok', true, 'why', 'already'); end if;
  if not l.active then return jsonb_build_object('ok', false, 'why', 'That link has been turned off.'); end if;
  if l.until <= now() then return jsonb_build_object('ok', false, 'why', 'That link has ended.'); end if;
  select count(*) into used from public.profiles where friend_link = l.code;
  if used >= l.max_uses then return jsonb_build_object('ok', false, 'why', 'That link has been used up.'); end if;
  perform set_config('halo.trusted', 'on', true);
  update public.profiles
     set friend_link = l.code, friend_from = l.from_name, friend_joined_at = now(),
         reward_tier = 'max', reward_until = greatest(coalesce(reward_until, now()), l.until),
         trial_started_at = coalesce(trial_started_at, now()),
         trial_ends_at = least(coalesce(trial_ends_at, now()), now())
   where user_id = me;
  return jsonb_build_object('ok', true, 'until', l.until, 'from', l.from_name);
end $$;

grant execute on function public.create_friend_link(text, int, timestamptz, text) to authenticated;
grant execute on function public.set_friend_link_active(text, boolean) to authenticated;
grant execute on function public.list_friend_links() to authenticated;
grant execute on function public.claim_friend_link(text) to authenticated;
