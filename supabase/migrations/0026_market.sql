-- The GCU student market (2026-10-08): where a sign-up came from, and the "finish on your laptop" email.
--
-- 1. profiles.signup_source: 'market' for an account made from the table's QR code (haloplus.app/market). Set once by
--    the student's own session right after sign-up; never changed after.
-- 2. email_outbox: emails the app wants sent (one kind per student), sent by the email-send function through Resend
--    at most 30 an hour. No client reads it; the admin screen counts it through admin_growth().
-- 3. email_send_tick(): every five minutes, like notify_send_tick(), using the same cron secret from Vault and the
--    notify-send URL with the function name swapped, so nothing new goes into Vault.

alter table public.profiles add column if not exists signup_source text;

create or replace function public.set_signup_source(p_source text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if p_source not in ('market') then return false; end if;
  update public.profiles set signup_source = p_source where user_id = auth.uid() and signup_source is null;
  return found;
end $$;
revoke all on function public.set_signup_source(text) from public, anon;
grant execute on function public.set_signup_source(text) to authenticated;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  to_email text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  unique (user_id, kind)
);
alter table public.email_outbox enable row level security;
revoke all on table public.email_outbox from public, anon, authenticated;

-- The student asks for the email; the address is the account's own.
create or replace function public.queue_email(p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  addr text;
begin
  if auth.uid() is null then return false; end if;
  if p_kind not in ('market_setup') then return false; end if;
  select email into addr from auth.users where id = auth.uid();
  if addr is null then return false; end if;
  insert into public.email_outbox (user_id, to_email, kind) values (auth.uid(), addr, p_kind) on conflict (user_id, kind) do nothing;
  return found;
end $$;
revoke all on function public.queue_email(text) from public, anon;
grant execute on function public.queue_email(text) to authenticated;

create or replace function public.email_send_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  u text;
  s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'notify_send_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notify_cron_secret';
  if u is null or s is null then return; end if;
  if not exists (select 1 from public.email_outbox where sent_at is null and attempts < 5) then return; end if;
  perform net.http_post(url := replace(u, 'notify-send', 'email-send'), headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s), body := '{}'::jsonb);
end $$;
revoke all on function public.email_send_tick() from public, anon, authenticated;

select cron.unschedule('email-send') where exists (select 1 from cron.job where jobname = 'email-send');
select cron.schedule('email-send', '*/5 * * * *', 'select public.email_send_tick()');

-- Growth: how many real students came from the market, and how the emails went.
create or replace function public.admin_growth() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz text := 'America/Phoenix';
  today date := (now() at time zone tz)::date;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with real as (
      select u.id, u.created_at, (u.created_at at time zone tz)::date as day, public.plan_bucket(u.id) as bucket, p.signup_source
        from auth.users u join public.profiles p on p.user_id = u.id
       where not public.is_test_account(u.id)
    ),
    active as (select e.user_id, max(e.day) as last from public.usage_events e where e.user_id in (select id from real) group by e.user_id),
    paying as (select s.tier, s.interval from public.subscriptions s where s.user_id in (select id from real) and s.status in ('active', 'trialing', 'past_due'))
    select jsonb_build_object(
      'today', today,
      'total', (select count(*) from real),
      'new_today', (select count(*) from real where day = today),
      'new_week', (select count(*) from real where day > today - 7),
      'active_today', (select count(*) from active where last >= today - 1 and last >= (now() at time zone 'utc')::date),
      'active_week', (select count(*) from active where last > (now() at time zone 'utc')::date - 7),
      'plans', (select coalesce(jsonb_object_agg(bucket, n), '{}'::jsonb) from (select bucket, count(*) n from real group by bucket) b),
      'paying', (select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'interval', interval)), '[]'::jsonb) from paying),
      'per_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', (select count(*) from real where day = d)) order by d), '[]'::jsonb)
                    from generate_series(today - 29, today, interval '1 day') g(d)),
      'tests', (select count(*) from auth.users u where public.is_test_account(u.id)),
      'market', jsonb_build_object(
        'total', (select count(*) from real where signup_source = 'market'),
        'week', (select count(*) from real where signup_source = 'market' and day > today - 7),
        'emails_sent', (select count(*) from public.email_outbox o where o.kind = 'market_setup' and o.sent_at is not null and o.user_id in (select id from real)),
        'emails_waiting', (select count(*) from public.email_outbox o where o.kind = 'market_setup' and o.sent_at is null and o.user_id in (select id from real))
      )
    )
  );
end $$;
revoke all on function public.admin_growth() from public, anon;
grant execute on function public.admin_growth() to authenticated;
