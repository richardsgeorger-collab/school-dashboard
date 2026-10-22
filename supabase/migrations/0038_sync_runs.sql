-- 2026-10-21 (George: "sync cannot fail even 10% of the time"). Every extension sync run, from 0.7.6: when it started,
-- how it ended and why, whether it recovered by reloading Halo and trying again, and which tab it read. Written only by
-- the sync-run function (service role); read only by admin_sync_health. A run that started and never ended is "stuck".
create table if not exists public.sync_runs (
  run_id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  device_id text,
  ext_version text,
  browser text,
  auto boolean,
  setup boolean,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text check (outcome in ('landed', 'failed', 'kept', 'skipped')),
  cause text,
  retried boolean not null default false,
  tab text,
  seconds int
);
create index if not exists sync_runs_started_idx on public.sync_runs (started_at desc);
alter table public.sync_runs enable row level security;

-- Last N days: runs started, landed, by cause, recovered by the automatic retry, stuck; real accounts only (a run whose
-- account is unknown, no key yet, counts as unknown, not as a test).
create or replace function public.admin_sync_health(p_days int default 7) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with r as (
      select s.*, case when s.ended_at is null and s.started_at < now() - interval '20 minutes' then 'stuck' when s.ended_at is null then 'running' else s.outcome end as state
      from public.sync_runs s
      where s.started_at > since and (s.user_id is null or not public.is_test_account(s.user_id))
    )
    select jsonb_build_object(
      'days', p_days,
      'started', (select count(*) from r where state <> 'skipped'),
      'landed', (select count(*) from r where state = 'landed'),
      'recovered', (select count(*) from r where state = 'landed' and retried),
      'kept', (select count(*) from r where state = 'kept'),
      'failed', (select count(*) from r where state = 'failed'),
      'stuck', (select count(*) from r where state = 'stuck'),
      'running', (select count(*) from r where state = 'running'),
      'skipped', (select count(*) from r where state = 'skipped'),
      'setup', jsonb_build_object('started', (select count(*) from r where setup and state <> 'skipped'), 'landed', (select count(*) from r where setup and state = 'landed')),
      'by_cause', coalesce((select jsonb_agg(jsonb_build_object('cause', cause, 'n', n, 'devices', d) order by n desc) from (
        select coalesce(case when state = 'stuck' then 'stuck' else cause end, 'unknown') cause, count(*) n, count(distinct device_id) d from r where state in ('failed', 'stuck', 'kept') group by 1) c), '[]'::jsonb),
      'by_browser', coalesce((select jsonb_agg(jsonb_build_object('browser', b, 'started', s, 'landed', l) order by s desc) from (
        select coalesce(browser, 'unknown') b, count(*) filter (where state <> 'skipped') s, count(*) filter (where state = 'landed') l from r group by 1) x), '[]'::jsonb),
      'users', (select count(distinct user_id) from r where user_id is not null)
    )
  );
end $$;
grant execute on function public.admin_sync_health(int) to authenticated;

-- Kept for 90 days.
select cron.unschedule('sync-runs-prune') where exists (select 1 from cron.job where jobname = 'sync-runs-prune');
select cron.schedule('sync-runs-prune', '41 4 * * *', $$delete from public.sync_runs where started_at < now() - interval '90 days'$$);
