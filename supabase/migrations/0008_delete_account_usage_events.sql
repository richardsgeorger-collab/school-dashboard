-- delete_my_account predates usage_events (0006), so a student who deleted their account left their usage counts
-- behind. Same function, one more table. Nothing else changes.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.items where user_id = uid;
  delete from public.courses where user_id = uid;
  delete from public.settings where user_id = uid;
  delete from public.terms where user_id = uid;
  delete from public.announcements where user_id = uid;
  delete from public.read_ledger where user_id = uid;
  delete from public.usage_log where user_id = uid;
  delete from public.usage_events where user_id = uid;
  delete from public.push_subscriptions where user_id = uid;
  delete from public.notification_prefs where user_id = uid;
  delete from public.notification_plan where user_id = uid;
  delete from public.onboarding_events where user_id = uid;
  delete from public.feedback where user_id = uid;
  delete from public.recordings where user_id = uid;
  delete from public.subscriptions where user_id = uid;
  delete from public.referrals where inviter = uid or invitee = uid;
  delete from public.profiles where user_id = uid;
  delete from auth.users where id = uid;
end $$;
