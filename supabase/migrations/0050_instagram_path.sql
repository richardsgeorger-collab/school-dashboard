-- Loop 294 (2026-10-30): the Instagram path, friendly and measured (George). Most Instagram visitors open haloplus.app
-- on a phone, where the extension cannot go; the phone screen sends the laptop page to their laptop (the share sheet,
-- or one email), and every step is counted for Admin.
-- 1. funnel_events: the signed-out steps (an Instagram visit, the phone option used, the laptop page opened, the
--    welcome tab after the install), one row per browser (a random id in that browser) and step. Written only by the
--    report function (service role); nobody reads it but Admin's RPC.
-- 2. laptop_links: the one email "Open this on your laptop". Only a keyed hash of the address is kept (never the
--    address), so the same address is never sent twice; with a hash of the IP for the per-IP limit.
-- 3. set_signup_source takes 'ig' too.
-- 4. admin_ig_funnel: Instagram visit → phone option (share, email, app) → laptop page → installed → signed up →
--    first sync → still using a week later. Real students only; Phoenix days.

create table if not exists public.funnel_events (
  vid text not null check (vid ~ '^[A-Za-z0-9_-]{8,40}$'),
  step text not null check (step in ('visit', 'share', 'copy', 'email', 'app', 'laptop', 'laptop-store', 'welcome')),
  src text not null check (src in ('ig')),
  via text check (via in ('share', 'copy', 'email', 'direct')),
  device text check (device in ('phone', 'tablet', 'laptop')),
  browser text check (char_length(browser) <= 20),
  at timestamptz not null default now(),
  primary key (vid, step)
);
alter table public.funnel_events enable row level security;
create index if not exists funnel_events_at on public.funnel_events (at);

create table if not exists public.laptop_links (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  vid text,
  sent_at timestamptz not null default now(),
  status text not null default 'sent' check (status in ('sent', 'failed'))
);
alter table public.laptop_links enable row level security;
create index if not exists laptop_links_ip on public.laptop_links (ip_hash, sent_at);

create or replace function public.set_signup_source(p_source text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if p_source not in ('market', 'store', 'ig') then return false; end if;
  update public.profiles set signup_source = p_source where user_id = auth.uid() and signup_source is null;
  return found;
end $$;
revoke all on function public.set_signup_source(text) from public, anon;
grant execute on function public.set_signup_source(text) to authenticated;

create or replace function public.admin_ig_funnel(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with ev as (select * from public.funnel_events where src = 'ig' and at >= since),
    acc as (
      select p.user_id, u.created_at, p.trial_synced_at
      from public.profiles p join auth.users u on u.id = p.user_id
      where u.created_at >= since and public.is_real_student(p.user_id) and p.signup_source = 'ig'
    )
    select jsonb_build_object(
      'days', p_days,
      'visits', (select count(*) from ev where step = 'visit'),
      'visits_phone', (select count(*) from ev where step = 'visit' and device in ('phone', 'tablet')),
      'share', (select count(*) from ev where step = 'share'),
      'copy', (select count(*) from ev where step = 'copy'),
      'email', (select count(*) from ev where step = 'email'),
      'app', (select count(*) from ev where step = 'app'),
      'laptop', (select count(*) from ev where step = 'laptop'),
      'laptop_share', (select count(*) from ev where step = 'laptop' and via in ('share', 'copy')),
      'laptop_email', (select count(*) from ev where step = 'laptop' and via = 'email'),
      'laptop_store', (select count(*) from ev where step = 'laptop-store'),
      'installed', (select count(*) from ev where step = 'welcome'),
      'signed_up', (select count(*) from acc),
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
