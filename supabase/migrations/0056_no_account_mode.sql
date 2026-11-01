-- Loop 305 (2026-11-01, George): no-account mode, behind a switch, for new Web Store installs only.
-- 1. Settings: 'no_account_new_installs' (Admin's switch, real installs) and 'no_account_test_installs' (the same for
--    test browsers only, so a test run never changes what a real student gets). 'on' or empty.
-- 2. ext_installs.grp: the group an install was put in when it was installed ('no-account' or 'current'); installs
--    from before, and installs from Halo+'s own setup, have none (unchanged).
-- 3. admin_ext_groups(): the two groups side by side (installs, active this week, a week after install, accounts,
--    first sync), real browsers only.
alter table public.ext_installs add column if not exists grp text check (grp in ('no-account', 'current'));

create or replace function public.admin_set_setting(p_key text, p_value text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  if p_key not in ('extension_url', 'no_account_new_installs', 'no_account_test_installs') then raise exception 'unknown setting'; end if;
  if p_key = 'extension_url' and nullif(trim(p_value), '') is not null and trim(p_value) !~ '^https://(chromewebstore\.google\.com|chrome\.google\.com/webstore)/' then
    raise exception 'That is not a Chrome Web Store address.';
  end if;
  if p_key like 'no_account_%' and coalesce(p_value, '') not in ('', 'on') then raise exception 'on or off'; end if;
  insert into public.app_settings (key, value, updated_at, updated_by) values (p_key, nullif(trim(p_value), ''), now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;
grant execute on function public.admin_set_setting(text, text) to authenticated;

create or replace function public.admin_setting(p_key text) returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (select value from public.app_settings where key = p_key);
end $$;
revoke all on function public.admin_setting(text) from public, anon;
grant execute on function public.admin_setting(text) to authenticated;

create or replace function public.admin_ext_groups() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare tz constant text := 'America/Phoenix'; today date := (now() at time zone tz)::date;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with g as (
      select i.* from public.ext_installs i where i.grp is not null and public.ext_device_counts(i.device_id)
    )
    select coalesce(jsonb_object_agg(grp, x), '{}'::jsonb) from (
      select g.grp, jsonb_build_object(
        'installs', count(*),
        'since', min(g.installed_at),
        'active_7', count(*) filter (where exists (select 1 from public.ext_pings p where p.device_id = g.device_id and p.day > today - 7)),
        'week_eligible', count(*) filter (where g.installed_at <= now() - interval '7 days'),
        'week_later', count(*) filter (where g.installed_at <= now() - interval '7 days' and exists (select 1 from public.ext_pings p where p.device_id = g.device_id and p.day >= (g.installed_at at time zone tz)::date + 7)),
        'accounts', count(*) filter (where g.user_id is not null),
        'first_sync', count(*) filter (where exists (select 1 from public.profiles pr where pr.user_id = g.user_id and pr.trial_synced_at is not null)),
        'uninstalled', count(*) filter (where g.uninstalled_at is not null)
      ) x from g group by g.grp
    ) t
  );
end $$;
revoke all on function public.admin_ext_groups() from public, anon;
grant execute on function public.admin_ext_groups() to authenticated;
