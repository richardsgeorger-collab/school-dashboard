-- Error monitoring (George, 2026-09-30, launch day): know when something breaks before a student has to say so.
-- Every report goes through the `report` Edge Function (service role), which scrubs, rate-limits and alerts. Nobody
-- reads or writes these tables directly: no RLS policies at all. Admins read through the functions below. Kept 30 days.

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  fingerprint text not null,
  kind text not null check (kind in ('crash', 'rejection', 'function', 'extension', 'server', 'silent', 'test')),
  title text not null,
  message text,
  stack text,
  place text,
  status int,
  app_version text,
  ext_version text,
  browser text,
  device text,
  plan text,
  anon_id text,
  device_id text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists error_events_fp on public.error_events (fingerprint, created_at desc);
create index if not exists error_events_at on public.error_events (created_at);
create index if not exists error_events_device on public.error_events (device_id, created_at desc);
alter table public.error_events enable row level security;

-- One row per kind of problem, grouped by fingerprint.
create table if not exists public.error_issues (
  fingerprint text primary key,
  kind text not null,
  title text not null,
  place text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  count int not null default 0,
  last_app_version text,
  last_ext_version text,
  sample_id uuid,
  resolved_at timestamptz,
  resolved_version text,
  reopened_at timestamptz,
  alerted_at timestamptz
);
alter table public.error_issues enable row level security;

-- Every alert tried, whether it went out, and how.
create table if not exists public.error_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  fingerprint text not null,
  reason text not null,
  subject text not null,
  channel text not null,
  ok boolean not null,
  detail text
);
alter table public.error_alerts enable row level security;

-- Records one event and updates its issue in one step. Returns what the alert rule needs: new issue, reopened after a
-- new deploy, how many in the last 10 minutes, and when it last alerted.
create or replace function public.error_record(e jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fp text := e->>'fingerprint';
  ev uuid;
  iss public.error_issues%rowtype;
  is_new boolean := false;
  reopened boolean := false;
  recent int;
begin
  insert into public.error_events (fingerprint, kind, title, message, stack, place, status, app_version, ext_version, browser, device, plan, anon_id, device_id, details)
  values (fp, e->>'kind', e->>'title', e->>'message', e->>'stack', e->>'place', nullif(e->>'status', '')::int, e->>'app_version', e->>'ext_version', e->>'browser', e->>'device', e->>'plan', e->>'anon_id', e->>'device_id', coalesce(e->'details', '{}'::jsonb))
  returning id into ev;
  select * into iss from public.error_issues where fingerprint = fp for update;
  if not found then
    is_new := true;
    insert into public.error_issues (fingerprint, kind, title, place, count, last_app_version, last_ext_version, sample_id)
    values (fp, e->>'kind', e->>'title', e->>'place', 1, e->>'app_version', e->>'ext_version', ev);
  else
    -- Resolved, and it happened again on a different build than the one it was resolved on: open again.
    if iss.resolved_at is not null and coalesce(e->>'app_version', e->>'ext_version', '') is distinct from coalesce(iss.resolved_version, '') then
      reopened := true;
    end if;
    update public.error_issues set
      last_seen = now(), count = count + 1, title = e->>'title', sample_id = ev,
      last_app_version = coalesce(e->>'app_version', last_app_version), last_ext_version = coalesce(e->>'ext_version', last_ext_version),
      resolved_at = case when reopened then null else resolved_at end,
      reopened_at = case when reopened then now() else reopened_at end
    where fingerprint = fp;
  end if;
  select count(*) into recent from public.error_events where fingerprint = fp and created_at > now() - interval '10 minutes';
  select * into iss from public.error_issues where fingerprint = fp;
  return jsonb_build_object('event', ev, 'is_new', is_new, 'reopened', reopened, 'recent', recent, 'alerted_at', iss.alerted_at, 'resolved', iss.resolved_at is not null);
end $$;
revoke all on function public.error_record(jsonb) from public, anon, authenticated;

-- A device that has sent this many in the last 10 minutes is dropped (one broken loop cannot flood the table).
create or replace function public.error_device_recent(dev text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.error_events where device_id = dev and created_at > now() - interval '10 minutes';
$$;
revoke all on function public.error_device_recent(text) from public, anon, authenticated;

-- ---- the Admin page ------------------------------------------------------------------------------------------------
create or replace function public.admin_errors() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.resolved, t.last_seen desc) from (
      select i.fingerprint, i.kind, i.title, i.place, i.first_seen, i.last_seen, i.count, i.last_app_version, i.last_ext_version,
             i.resolved_at is not null as resolved, i.resolved_at, i.reopened_at, i.alerted_at,
             (select count(distinct coalesce(e.anon_id, e.device_id)) from public.error_events e where e.fingerprint = i.fingerprint) as students,
             (select count(*) from public.error_events e where e.fingerprint = i.fingerprint and e.created_at > now() - interval '24 hours') as last_day,
             (select array_agg(distinct v) from (select coalesce(e.app_version, 'ext ' || e.ext_version) v from public.error_events e where e.fingerprint = i.fingerprint order by 1 limit 6) x) as versions
        from public.error_issues i
       order by i.last_seen desc
       limit 200
    ) t), '[]'::jsonb);
end $$;
grant execute on function public.admin_errors() to authenticated;

create or replace function public.admin_error_sample(fp text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'sample', (select row_to_json(e) from public.error_events e where e.fingerprint = fp order by created_at desc limit 1),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'app_version', app_version, 'ext_version', ext_version, 'browser', browser, 'device', device, 'plan', plan, 'place', place, 'status', status) order by created_at desc) from (select * from public.error_events where fingerprint = fp order by created_at desc limit 10) r), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'reason', reason, 'channel', channel, 'ok', ok, 'detail', detail) order by created_at desc) from (select * from public.error_alerts where fingerprint = fp order by created_at desc limit 5) a), '[]'::jsonb)
  );
end $$;
grant execute on function public.admin_error_sample(text) to authenticated;

-- Resolved on the build the admin is looking at; the same problem on any other build opens it again.
create or replace function public.admin_resolve_error(fp text, resolved boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  update public.error_issues set
    resolved_at = case when resolved then now() else null end,
    resolved_version = case when resolved then coalesce(last_app_version, last_ext_version) else null end
  where fingerprint = fp;
end $$;
grant execute on function public.admin_resolve_error(text, boolean) to authenticated;

-- ---- 30 days ---------------------------------------------------------------------------------------------------------
select cron.unschedule('error-prune') where exists (select 1 from cron.job where jobname = 'error-prune');
select cron.schedule('error-prune', '25 4 * * *', $$
  delete from public.error_events where created_at < now() - interval '30 days';
  delete from public.error_alerts where created_at < now() - interval '30 days';
  delete from public.error_issues where last_seen < now() - interval '30 days';
$$);
