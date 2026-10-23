-- 2026-10-22: Halo+ on Halo pages (extension 0.8.0). What happened there is counted per student per day in usage_events
-- (keys halo:card-shown, halo:card-closed, halo:card-click, halo:pill-click, halo:class-click, halo:box-click,
-- halo:badge-click, ...), written by the report function from the extension's sync key; opens of Halo+ that came from
-- Halo are counted by the app itself (halo:open-<where>).

create or replace function public.bump_usage_for(p_user uuid, p_key text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_key !~ '^[a-z0-9_.:-]{1,64}$' then return; end if;
  insert into public.usage_events (user_id, day, key, n) values (p_user, (now() at time zone 'utc')::date, p_key, 1)
  on conflict (user_id, day, key) do update set n = public.usage_events.n + 1;
end $$;
revoke all on function public.bump_usage_for(uuid, text) from public, anon, authenticated;
grant execute on function public.bump_usage_for(uuid, text) to service_role;

-- For Admin: each Halo+-on-Halo moment over the window, times and students; opens from Halo; real students only.
create or replace function public.admin_halo_presence(p_days int default 14) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since date := ((now() at time zone 'utc')::date - greatest(1, least(coalesce(p_days, 14), 90)));
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'days', p_days,
    'events', coalesce((select jsonb_object_agg(k, jsonb_build_object('n', n, 'users', u)) from (
      select replace(key, 'halo:', '') k, sum(n) n, count(distinct user_id) u from public.usage_events
      where key like 'halo:%' and key not like 'halo:open-%' and day > since and not public.is_test_account(user_id) group by 1) e), '{}'::jsonb),
    'opens', (select coalesce(sum(n), 0) from public.usage_events where key like 'halo:open-%' and day > since and not public.is_test_account(user_id)),
    'opens_users', (select count(distinct user_id) from public.usage_events where key like 'halo:open-%' and day > since and not public.is_test_account(user_id)),
    'opens_by', coalesce((select jsonb_object_agg(k, n) from (select replace(key, 'halo:open-', '') k, sum(n) n from public.usage_events where key like 'halo:open-%' and day > since and not public.is_test_account(user_id) group by 1) o), '{}'::jsonb)
  );
end $$;
grant execute on function public.admin_halo_presence(int) to authenticated;
