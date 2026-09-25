-- One row per notification, ever: "the morning note for Sep 25" can exist once per student. The planner upserts on
-- this key, so overlapping planner runs converge on one row instead of stacking duplicates. Safe to run twice.

alter table public.notification_plan add column if not exists key text;

-- Rows planned before the key existed: keep one per (user, kind, send_at), the rest go.
delete from public.notification_plan a using public.notification_plan b
 where a.key is null and b.key is null and a.user_id = b.user_id and a.kind = b.kind and a.send_at = b.send_at and a.id > b.id;
update public.notification_plan set key = kind || ':' || to_char(send_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') where key is null;

alter table public.notification_plan alter column key set not null;
create unique index if not exists notification_plan_user_key on public.notification_plan (user_id, key);
