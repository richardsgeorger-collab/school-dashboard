-- 2026-10-13: a sync the account recorded counts as landed in Admin's sign-up funnel even when its classes are gone
-- since (egilbert28: synced on Oct 6, then erased by a repair script on Oct 9; "Synced, but no classes now").
create or replace function public.admin_signup_funnel(p_days int default 14) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  rows jsonb;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  with acct as (
    select u.id, u.email, u.created_at, p.trial_synced_at
    from auth.users u join public.profiles p on p.user_id = u.id
    where u.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 14), 90)))
      and not public.is_test_account(u.id) and not coalesce(p.is_admin, false)
  ), ev as (
    select e.user_id, e.step, e.event, e.at, e.device, e.browser, e.platform from public.onboarding_events e where e.user_id in (select id from acct)
  ), per as (
    select a.id, split_part(a.email, '@', 1) as who, a.created_at,
      coalesce(
        (select e.device from ev e where e.user_id = a.id and e.device is not null order by e.at limit 1),
        (select public.ua_device(s.user_agent) from auth.sessions s where s.user_id = a.id and s.user_agent is not null order by s.created_at limit 1),
        (select case when e.platform = 'phone' then 'phone' else 'laptop' end from ev e where e.user_id = a.id order by e.at limit 1)) as device,
      coalesce(
        (select e.browser from ev e where e.user_id = a.id and e.browser is not null order by e.at limit 1),
        (select public.ua_browser(s.user_agent) from auth.sessions s where s.user_id = a.id and s.user_agent is not null order by s.created_at limit 1)) as browser,
      exists (select 1 from ev e where e.user_id = a.id and (e.step like 'halo%' or e.step like 'connect%' or e.step like 'ext-setup-%' or e.step = 'market-handoff')) as reached_connect,
      exists (select 1 from ev e where e.user_id = a.id and ((e.step = 'halo:ext-wait' and e.event = 'enter') or e.step in ('ext-setup-store', 'connect:store'))) as clicked_store,
      exists (select 1 from ev e where e.user_id = a.id and e.step in ('halo:ext-connected', 'ext-setup-connected', 'connect:ext-found'))
        or exists (select 1 from public.settings s where s.user_id = a.id and s.data->'lastPull'->>'via' = 'extension')
        or exists (select 1 from public.pending_syncs ps where ps.user_id = a.id and ps.payload->>'source' = 'extension') as installed,
      exists (select 1 from ev e where e.user_id = a.id and e.event = 'complete' and e.step in ('halo:open', 'halo:p-open', 'halo:i-test', 'connect:halo')) as opened_halo,
      exists (select 1 from ev e where e.user_id = a.id and e.event = 'complete' and e.step in ('connect:handoff', 'market-handoff')) as handoff,
      exists (select 1 from ev e where e.user_id = a.id and coalesce(e.device, case when e.platform = 'desktop' then 'laptop' end) = 'laptop') as on_laptop,
      (a.trial_synced_at is not null
        or exists (select 1 from public.courses c where c.user_id = a.id)
        or exists (select 1 from public.pending_syncs ps where ps.user_id = a.id)
        or exists (select 1 from public.settings s where s.user_id = a.id and s.data->'lastPull'->>'at' is not null)
        or exists (select 1 from ev e where e.user_id = a.id and e.step = 'sync' and e.event = 'complete')) as landed,
      (select count(*) from public.courses c where c.user_id = a.id and c.deleted_at is null) as classes_now,
      (select max(e.at) from ev e where e.user_id = a.id) as last_step_at
    from acct a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'who', who, 'created_at', created_at, 'device', coalesce(device, 'unknown'), 'browser', coalesce(browser, 'unknown'),
      'reached_connect', reached_connect or landed, 'clicked_store', clicked_store, 'installed', installed,
      'opened_halo', opened_halo or landed, 'handoff', handoff, 'on_laptop', on_laptop, 'landed', landed,
      'classes_now', classes_now, 'last_step_at', last_step_at) order by created_at desc), '[]'::jsonb)
    into rows from per;
  return jsonb_build_object('days', p_days, 'accounts', rows);
end $$;
grant execute on function public.admin_signup_funnel(int) to authenticated;
