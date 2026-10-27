-- Loop 269 (2026-10-26, review of Loop 268): "installed" can be said by anyone (a Web Store install has no account
-- yet), so the store funnel also reports installs that later linked to a real account, the number to trust.
create or replace function public.admin_store_funnel(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with acc as (
      select p.user_id, u.created_at, p.trial_synced_at
      from public.profiles p join auth.users u on u.id = p.user_id
      where u.created_at >= since and public.is_real_student(p.user_id)
        and (p.signup_source = 'store' or exists (select 1 from public.ext_installs i where i.user_id = p.user_id and i.source = 'store'))
    )
    select jsonb_build_object(
      'days', p_days,
      'installs', (select count(*) from public.ext_installs i where i.source = 'store' and i.installed_at >= since and (i.user_id is null or public.is_real_student(i.user_id))),
      'installs_linked', (select count(*) from public.ext_installs i where i.source = 'store' and i.installed_at >= since and i.user_id is not null and public.is_real_student(i.user_id)),
      'site_installs', (select count(*) from public.ext_installs i where i.source = 'site' and i.installed_at >= since and (i.user_id is null or public.is_real_student(i.user_id))),
      'signed_up', (select count(*) from acc),
      'first_sync', (select count(*) from acc where trial_synced_at is not null),
      'week_eligible', (select count(*) from acc where created_at <= now() - interval '7 days'),
      'week_later', (select count(*) from acc a where a.created_at <= now() - interval '7 days' and exists (
        select 1 from public.usage_events e where e.user_id = a.user_id and (e.key like 'screen:%' or e.key like 'halo:%') and e.day >= (a.created_at at time zone 'America/Phoenix')::date + 7))
    )
  );
end $$;
grant execute on function public.admin_store_funnel(int) to authenticated;
