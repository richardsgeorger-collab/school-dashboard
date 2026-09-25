-- The admin screen (one function, admins only) and feedback screenshots (a private bucket). Safe to run twice.

drop view if exists public.admin_overview;

-- Everything the admin screen shows, in one call. Refuses anyone who is not an admin.
create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ok boolean;
  result jsonb;
begin
  select is_admin into ok from public.profiles where user_id = me;
  if not coalesce(ok, false) then raise exception 'not an admin'; end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'by_tier', (select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb) from (select tier, count(*) n from public.profiles group by tier) t),
    'on_trial', (select count(*) from public.profiles where trial_ends_at > now()),
    'paying', (select count(*) from public.subscriptions where status in ('active', 'trialing', 'past_due')),
    'ai_cost_month', (select coalesce(sum(cost_usd), 0) from public.usage_log where day >= date_trunc('month', now())::date),
    'ai_calls_month', (select count(*) from public.usage_log where day >= date_trunc('month', now())::date),
    'funnel', (select coalesce(jsonb_agg(jsonb_build_object('step', step, 'event', event, 'n', n)), '[]'::jsonb)
                 from (select step, event, count(distinct user_id) n from public.onboarding_events where step <> 'sync' group by step, event) f),
    'syncs_7d', (select coalesce(jsonb_object_agg(coalesce(platform, 'unknown'), n), '{}'::jsonb)
                   from (select platform, count(*) n from public.onboarding_events where step = 'sync' and at > now() - interval '7 days' group by platform) s),
    'syncing_users_30d', (select count(distinct user_id) from public.onboarding_events where step = 'sync' and at > now() - interval '30 days'),
    'phone_only_syncers', (select count(*) from (select user_id from public.onboarding_events where step = 'sync' and at > now() - interval '30 days' group by user_id having bool_and(platform = 'phone')) p),
    'feedback_open', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'screen', screen, 'text', text, 'screenshot_path', screenshot_path, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
                        from (select * from public.feedback where resolved_at is null order by created_at desc limit 50) fb)
  ) into result;
  return result;
end $$;

create or replace function public.admin_resolve_feedback(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select is_admin into ok from public.profiles where user_id = auth.uid();
  if not coalesce(ok, false) then raise exception 'not an admin'; end if;
  update public.feedback set resolved_at = now() where id = p_id;
end $$;

-- Screenshots: a private bucket, each student writes under their own id, admins read.
insert into storage.buckets (id, name, public) values ('feedback', 'feedback', false) on conflict (id) do nothing;
drop policy if exists "own feedback uploads" on storage.objects;
create policy "own feedback uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "admins read feedback uploads" on storage.objects;
create policy "admins read feedback uploads" on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and exists (select 1 from public.profiles where user_id = auth.uid() and is_admin));
