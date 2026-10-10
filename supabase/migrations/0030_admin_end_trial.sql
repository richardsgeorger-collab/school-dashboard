-- 2026-10-10 (George): an admin ends a test account's free week now, to try the $2.99 checkout for real. Only an
-- account marked Test (test_override, or the test-by-rule address); a real student's trial can never be ended here.
create or replace function public.admin_end_trial(p_email text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  p public.profiles%rowtype;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then return jsonb_build_object('ok', false, 'why', 'No account with that email.'); end if;
  if not public.is_test_account(uid) then return jsonb_build_object('ok', false, 'why', 'Not a test account. Mark it Test in Accounts first.'); end if;
  select * into p from public.profiles where user_id = uid;
  if p.user_id is null then return jsonb_build_object('ok', false, 'why', 'No profile.'); end if;
  if p.tier in ('plus', 'max') then return jsonb_build_object('ok', false, 'why', 'On a paid plan already.'); end if;
  perform set_config('halo.trusted', 'on', true);
  update public.profiles set trial_started_at = coalesce(trial_started_at, now() - interval '5 days'), trial_ends_at = now() - interval '1 minute', trial_synced_at = coalesce(trial_synced_at, now() - interval '5 days') where user_id = uid;
  update public.settings set data = data - 'trialEndSeen', updated_at = now() where user_id = uid;
  return jsonb_build_object('ok', true, 'user_id', uid, 'ended_at', now() - interval '1 minute');
end $$;
grant execute on function public.admin_end_trial(text) to authenticated;
