-- Loop 304 (2026-11-01, George: "an accurate extension user count"). The Web Store's numbers disagree (158 installs in
-- 30 days, 30 users on the listing, 48 accounts), so the extension counts itself, anonymously:
-- 1. ext_pings: one row per browser per day the extension runs (a random id per browser, the version, the plan or
--    "none", signed in or not). No student data, no Halo data.
-- 2. ext_installs also records an uninstall (the haloplus.app/bye page the extension opens when it is removed), its one
--    optional reason, and whether the browser is a test run (headless, Chrome for Testing, or loaded from source).
-- 3. ext_excluded: George's own browsers (Admin, opened in a browser with the extension, adds it).
-- 4. admin_ext_users(): installed now, active today/7/30 days, signed in or not, by version, a 30-day daily series,
--    uninstalls and reasons, and the install→account funnel. Excludes test browsers, excluded ones, and any browser
--    linked to an account that is not a real student.
-- 5. funnel_events learns src 'store' and the step 'signup-start' (the welcome tab after a Web Store install).

alter table public.ext_installs drop constraint if exists ext_installs_source_check;
alter table public.ext_installs add constraint ext_installs_source_check check (source in ('store', 'site', 'unknown'));
alter table public.ext_installs add column if not exists uninstalled_at timestamptz;
alter table public.ext_installs add column if not exists uninstall_reason text check (char_length(uninstall_reason) <= 40);
alter table public.ext_installs add column if not exists test boolean not null default false;

create table if not exists public.ext_pings (
  device_id text not null,
  day date not null,
  ext_version text,
  plan text check (char_length(plan) <= 12),
  signed_in boolean not null default false,
  at timestamptz not null default now(),
  primary key (device_id, day)
);
alter table public.ext_pings enable row level security;
create index if not exists ext_pings_day on public.ext_pings (day);

create table if not exists public.ext_excluded (
  device_id text primary key,
  at timestamptz not null default now(),
  by_user uuid references auth.users (id) on delete set null
);
alter table public.ext_excluded enable row level security;

alter table public.funnel_events drop constraint if exists funnel_events_src_check;
alter table public.funnel_events add constraint funnel_events_src_check check (src in ('ig', 'store'));
alter table public.funnel_events drop constraint if exists funnel_events_step_check;
alter table public.funnel_events add constraint funnel_events_step_check check (step in ('visit', 'fold', 'email-focus', 'email', 'email-signup', 'share', 'copy', 'google', 'apple', 'safari', 'app', 'preview', 'home-steps', 'home-screen', 'laptop', 'laptop-store', 'welcome', 'signup-start'));

/** A browser that counts: not a test run, not excluded, not linked to an account that is not a real student. */
create or replace function public.ext_device_counts(dev text) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.ext_excluded x where x.device_id = dev)
    and not coalesce((select i.test from public.ext_installs i where i.device_id = dev), false)
    and not exists (select 1 from public.ext_installs i where i.device_id = dev and i.user_id is not null and not public.is_real_student(i.user_id));
$$;
revoke all on function public.ext_device_counts(text) from public, anon, authenticated;

create or replace function public.admin_exclude_device(p_device text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{8,80}$' then return false; end if;
  insert into public.ext_excluded (device_id, by_user) values (p_device, auth.uid()) on conflict (device_id) do nothing;
  return true;
end $$;
revoke all on function public.admin_exclude_device(text) from public, anon;
grant execute on function public.admin_exclude_device(text) to authenticated;

create or replace function public.admin_ext_users() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Phoenix';
  today date := (now() at time zone tz)::date;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with dev as (
      -- Every browser known: installed (since Loop 268) or seen running (since Loop 304).
      select d.device_id from (select device_id from public.ext_installs union select device_id from public.ext_pings) d
      where public.ext_device_counts(d.device_id)
    ),
    gone as (select i.device_id from public.ext_installs i join dev using (device_id) where i.uninstalled_at is not null),
    p as (select e.* from public.ext_pings e join dev using (device_id)),
    last7 as (select distinct on (device_id) * from p where day > today - 7 order by device_id, day desc)
    select jsonb_build_object(
      'installed_now', (select count(*) from dev) - (select count(*) from gone),
      'known', (select count(*) from dev),
      'uninstalled', (select count(*) from gone),
      'uninstalled_30', (select count(*) from public.ext_installs i join gone using (device_id) where i.uninstalled_at > now() - interval '30 days'),
      'reasons', (select coalesce(jsonb_object_agg(r, n), '{}'::jsonb) from (select coalesce(i.uninstall_reason, 'no answer') r, count(*) n from public.ext_installs i join gone using (device_id) group by 1) t),
      'active_today', (select count(distinct device_id) from p where day = today),
      'active_7', (select count(distinct device_id) from p where day > today - 7),
      'active_30', (select count(distinct device_id) from p where day > today - 30),
      'signed_in_7', (select count(*) from last7 where signed_in),
      'signed_out_7', (select count(*) from last7 where not signed_in),
      'by_version', (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (select coalesce(ext_version, '?') v, count(*) n from last7 group by 1) t),
      'by_plan', (select coalesce(jsonb_object_agg(pl, n), '{}'::jsonb) from (select coalesce(plan, 'none') pl, count(*) n from last7 group by 1) t),
      'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', (select count(distinct device_id) from p where p.day = d), 'signed_in', (select count(distinct device_id) from p where p.day = d and p.signed_in)) order by d), '[]'::jsonb) from generate_series(today - 29, today, interval '1 day') g(dd), lateral (select g.dd::date d) x),
      'store_installs_30', (select count(*) from public.ext_installs i join dev using (device_id) where i.source = 'store' and i.installed_at > now() - interval '30 days'),
      'welcome_30', (select count(*) from public.funnel_events f where f.step = 'welcome' and f.at > now() - interval '30 days'),
      'signup_start_30', (select count(*) from public.funnel_events f where f.step = 'signup-start' and f.at > now() - interval '30 days'),
      'linked_30', (select count(*) from public.ext_installs i join dev using (device_id) where i.user_id is not null and i.installed_at > now() - interval '30 days'),
      'synced_30', (select count(*) from public.ext_installs i join dev using (device_id) join public.profiles pr on pr.user_id = i.user_id where i.installed_at > now() - interval '30 days' and pr.trial_synced_at is not null)
    )
  );
end $$;
revoke all on function public.admin_ext_users() from public, anon;
grant execute on function public.admin_ext_users() to authenticated;
