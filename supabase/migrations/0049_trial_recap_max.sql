-- The end of the free week counts only what Max did (George, 2026-10-29): besides announcements read and practice
-- built, how many times Halo synced on its own while the student was not on Halo (a scheduled sync that landed in a
-- tab the extension opened itself), the reminders sent, and the Sunday previews sent. The student's own rows only.
create or replace function public.my_trial_recap(p_since timestamptz, p_until timestamptz) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'asked', (select count(*) from public.usage_log where user_id = auth.uid() and created_at between p_since and p_until and kind in ('coach', 'tutor', 'brief', 'draft', 'method', 'other')),
    'practice', (select count(*) from public.usage_log where user_id = auth.uid() and created_at between p_since and p_until and kind in ('study', 'quiz', 'worksheet')),
    'read', (select count(*) from public.read_ledger where user_id = auth.uid() and read_at between p_since and p_until),
    'found', (select coalesce(sum(action_count), 0) from public.read_ledger where user_id = auth.uid() and read_at between p_since and p_until),
    'auto_syncs', (select count(*) from public.sync_runs where user_id = auth.uid() and auto and outcome = 'landed' and tab = 'own' and started_at between p_since and p_until),
    'reminders', (select count(*) from public.notification_plan where user_id = auth.uid() and sent_at between p_since and p_until and kind in ('morning', 'heavy_day', 'not_started', 'participation', 'caught')),
    'sundays', (select count(*) from public.notification_plan where user_id = auth.uid() and sent_at between p_since and p_until and kind = 'sunday')
  );
$$;
revoke all on function public.my_trial_recap(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_trial_recap(timestamptz, timestamptz) to authenticated;
