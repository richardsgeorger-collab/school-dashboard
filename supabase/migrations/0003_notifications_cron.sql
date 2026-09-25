-- Every five minutes, ask the notify-send function to send what is due. pg_cron, pg_net and Vault are free on
-- Supabase. No secret lives in this file: the function URL and the shared secret are read from Vault at run time.
-- Put them there once (the launch checklist does this):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-send', 'notify_send_url');
--   select vault.create_secret('<same value as the NOTIFY_CRON_SECRET function secret>', 'notify_cron_secret');
-- Until both exist the job runs and does nothing. Safe to run more than once.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create or replace function public.notify_send_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  u text;
  s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'notify_send_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notify_cron_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := u, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s), body := '{}'::jsonb);
end $$;
revoke all on function public.notify_send_tick() from public, anon, authenticated;

select cron.unschedule('notify-send') where exists (select 1 from cron.job where jobname = 'notify-send');
select cron.schedule('notify-send', '*/5 * * * *', 'select public.notify_send_tick()');

-- Plans older than a week are noise; the client rewrites the unsent ones on every change anyway.
select cron.unschedule('notification-plan-prune') where exists (select 1 from cron.job where jobname = 'notification-plan-prune');
select cron.schedule('notification-plan-prune', '15 4 * * *', $$ delete from public.notification_plan where created_at < now() - interval '7 days'; $$);
