-- Every five minutes, ask the notify-send function to send what is due. pg_cron and pg_net are free on Supabase.
-- Before running: replace PROJECT_REF with your project ref and NOTIFY_CRON_SECRET with the same value you set as
-- the notify-send function's secret. Safe to run more than once (the job is replaced by name).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

select cron.unschedule('notify-send') where exists (select 1 from cron.job where jobname = 'notify-send');

select cron.schedule(
  'notify-send',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/notify-send',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "NOTIFY_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Plans older than a week are noise; the client rewrites the unsent ones on every change anyway.
select cron.unschedule('notification-plan-prune') where exists (select 1 from cron.job where jobname = 'notification-plan-prune');
select cron.schedule('notification-plan-prune', '15 4 * * *', $$ delete from public.notification_plan where created_at < now() - interval '7 days'; $$);
