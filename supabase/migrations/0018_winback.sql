-- Win-back for students on Free after the Max week. notification_plan rows are pruned after 7 days, so a sent win-back
-- push is copied into its own log: the app reads it for "at most one a week" and "three ignored in a row", and the
-- Admin funnel counts sends from it.
create table if not exists public.winback_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index if not exists winback_sends_user_idx on public.winback_sends (user_id, sent_at desc);
alter table public.winback_sends enable row level security;
drop policy if exists "own winback sends" on public.winback_sends;
create policy "own winback sends" on public.winback_sends for select using (user_id = auth.uid());

create or replace function public.log_winback_send() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind like 'winback\_%' and new.sent_at is not null and old.sent_at is null then
    insert into public.winback_sends (user_id, kind, sent_at) values (new.user_id, substr(new.kind, 9), new.sent_at);
  end if;
  return new;
end $$;
drop trigger if exists notification_plan_winback on public.notification_plan;
create trigger notification_plan_winback after update of sent_at on public.notification_plan
  for each row execute function public.log_winback_send();

create or replace function public.admin_winback(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since date := (now() - make_interval(days => p_days))::date;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with real_users as (select id from auth.users where email not like '%@example.invalid'),
    ev as (
      select e.user_id, e.key, e.n from public.usage_events e join real_users u on u.id = e.user_id
       where e.day >= since and e.key like 'winback:%'
    ),
    paid as (
      select p.user_id from public.profiles p
       where p.tier in ('plus', 'pro', 'max') or exists (select 1 from public.subscriptions sb where sb.user_id = p.user_id)
    ),
    kinds(k) as (values ('peek'), ('exam'), ('stale'))
    select jsonb_build_object(
      'days', p_days,
      'peek_syncs', coalesce((select sum(n) from ev where key = 'winback:peek'), 0),
      'peek_students', (select count(distinct user_id) from ev where key = 'winback:peek'),
      'by_kind', (select jsonb_object_agg(k, jsonb_build_object(
          'sent', (select count(*) from public.winback_sends w join real_users u on u.id = w.user_id where w.kind = k and w.sent_at >= since),
          'opened', coalesce((select sum(n) from ev where key = 'winback:open:' || k), 0),
          'upgrade_taps', (select count(distinct user_id) from ev where key = 'winback:upgrade:' || k),
          'upgraded', (select count(distinct ev.user_id) from ev join paid on paid.user_id = ev.user_id where key = 'winback:upgrade:' || k)
        )) from kinds)
    )
  );
end $$;
grant execute on function public.admin_winback(int) to authenticated;
