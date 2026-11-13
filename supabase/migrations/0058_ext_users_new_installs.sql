-- Loop 314 (2026-11-12, George: the two numbers he looks at on Admin are the real students and the extension users).
-- admin_ext_users also says how many installs are new today and in the last 7 days, so the Extension users card can
-- show "+N today · +N this week" under "installed now" the way Growth does under "real students".
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
      -- New installs (Loop 314): the same two windows as the Growth card's students, in Phoenix days. Only real installs
      -- (Web Store, Halo+'s own page, the App Store), never a browser first seen by its ping ('unknown').
      'new_today', (select count(*) from public.ext_installs i join dev using (device_id) where i.source <> 'unknown' and (i.installed_at at time zone tz)::date = today),
      'new_week', (select count(*) from public.ext_installs i join dev using (device_id) where i.source <> 'unknown' and (i.installed_at at time zone tz)::date > today - 7),
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
      'by_platform', (select coalesce(jsonb_object_agg(pf, n), '{}'::jsonb) from (select coalesce(platform, 'chrome') pf, count(*) n from last7 group by 1) t),
      'appstore_installs_30', (select count(*) from public.ext_installs i join dev using (device_id) where i.source = 'appstore' and i.installed_at > now() - interval '30 days'),
      'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', (select count(distinct device_id) from p where p.day = d), 'signed_in', (select count(distinct device_id) from p where p.day = d and p.signed_in)) order by d), '[]'::jsonb) from generate_series(today - 29, today, interval '1 day') g(dd), lateral (select g.dd::date d) x),
      'store_installs_30', (select count(*) from public.ext_installs i join dev using (device_id) where i.source = 'store' and i.installed_at > now() - interval '30 days'),
      'welcome_30', (select count(*) from public.funnel_events f where f.step = 'welcome' and f.at > now() - interval '30 days'),
      'signup_start_30', (select count(*) from public.funnel_events f where f.step = 'signup-start' and f.at > now() - interval '30 days'),
      'linked_30', (select count(*) from public.ext_installs i join dev using (device_id) where i.source = 'store' and i.user_id is not null and i.installed_at > now() - interval '30 days'),
      'synced_30', (select count(*) from public.ext_installs i join dev using (device_id) join public.profiles pr on pr.user_id = i.user_id where i.source = 'store' and i.installed_at > now() - interval '30 days' and pr.trial_synced_at is not null)
    )
  );
end $$;
revoke all on function public.admin_ext_users() from public, anon;
grant execute on function public.admin_ext_users() to authenticated;
