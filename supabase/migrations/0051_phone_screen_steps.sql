-- Loop 298 (2026-10-30): the phone screen, step by step (George: "find where people stop"). New signed-out steps:
-- 'fold' (the main button was on screen without scrolling), 'email-focus' (the email box tapped), 'google' / 'apple'
-- (Continue with… tapped), 'safari' (Open in Safari tapped, from Instagram's browser, where Google sign-in is blocked).
-- 'account' (a Google or Apple account made on the phone) and 'first-sync' come from the accounts themselves.
alter table public.funnel_events drop constraint if exists funnel_events_step_check;
alter table public.funnel_events add constraint funnel_events_step_check check (step in ('visit', 'fold', 'email-focus', 'email', 'share', 'copy', 'google', 'apple', 'safari', 'app', 'laptop', 'laptop-store', 'welcome'));

create or replace function public.admin_ig_funnel(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days);
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with ev as (select * from public.funnel_events where src = 'ig' and at >= since),
    acc as (
      select p.user_id, u.created_at, p.trial_synced_at, coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider
      from public.profiles p join auth.users u on u.id = p.user_id
      where u.created_at >= since and public.is_real_student(p.user_id) and p.signup_source = 'ig'
    )
    select jsonb_build_object(
      'days', p_days,
      'visits', (select count(*) from ev where step = 'visit'),
      'visits_phone', (select count(*) from ev where step = 'visit' and device in ('phone', 'tablet')),
      'fold', (select count(*) from ev where step = 'fold'),
      'email_focus', (select count(*) from ev where step = 'email-focus'),
      'share', (select count(*) from ev where step = 'share'),
      'copy', (select count(*) from ev where step = 'copy'),
      'email', (select count(*) from ev where step = 'email'),
      'google', (select count(*) from ev where step = 'google'),
      'apple', (select count(*) from ev where step = 'apple'),
      'safari', (select count(*) from ev where step = 'safari'),
      'app', (select count(*) from ev where step = 'app'),
      'laptop', (select count(*) from ev where step = 'laptop'),
      'laptop_share', (select count(*) from ev where step = 'laptop' and via in ('share', 'copy')),
      'laptop_email', (select count(*) from ev where step = 'laptop' and via = 'email'),
      'laptop_store', (select count(*) from ev where step = 'laptop-store'),
      'installed', (select count(*) from ev where step = 'welcome'),
      'signed_up', (select count(*) from acc),
      'signed_up_phone', (select count(*) from acc where provider in ('google', 'apple')),
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
