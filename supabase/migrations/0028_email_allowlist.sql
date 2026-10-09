-- 2026-10-09 (George): "sync broken" mail only for paying Plus and Max; everything else about email is enforced in
-- the send function (an allowlist of kinds, one reminder a week, none to a student who opened Halo+ in three days).
create or replace function public.email_queue_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  queued_trial int := 0;
  queued_sync int := 0;
  r record;
begin
  for r in
    select p.user_id, u.email, p.trial_ends_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where p.trial_started_at is not null
      and p.trial_ends_at between now() + interval '12 hours' and now() + interval '36 hours'
      and p.tier not in ('plus', 'max')
      and p.friend_from is null
      and coalesce(p.is_admin, false) = false
      and coalesce(p.test_override, false) = false
      and coalesce(np.email, true) = true
      and u.email is not null
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind = 'trial_ending')
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind not in ('market_setup') and o.sent_at > now() - interval '7 days')
  loop
    insert into public.email_outbox (user_id, to_email, kind, meta) values (r.user_id, r.email, 'trial_ending', jsonb_build_object('ends_at', r.trial_ends_at)) on conflict (user_id, kind) do nothing;
    queued_trial := queued_trial + 1;
  end loop;

  -- Paying Plus and Max only.
  for r in
    select p.user_id, u.email, (s.data->'lastPull'->>'at')::timestamptz as last_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    join public.settings s on s.user_id = p.user_id
    left join public.notification_prefs np on np.user_id = p.user_id
    where s.data->'lastPull'->>'at' is not null
      and (s.data->'lastPull'->>'at')::timestamptz < now() - interval '3 days'
      and p.tier in ('plus', 'max')
      and exists (select 1 from public.subscriptions sub where sub.user_id = p.user_id and sub.status in ('active', 'trialing', 'past_due'))
      and coalesce(p.is_admin, false) = false
      and coalesce(p.test_override, false) = false
      and coalesce(np.email, true) = true
      and u.email is not null
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind = 'sync_broken')
      and not exists (select 1 from public.email_outbox o where o.user_id = p.user_id and o.kind not in ('market_setup') and o.sent_at > now() - interval '7 days')
  loop
    insert into public.email_outbox (user_id, to_email, kind, meta) values (r.user_id, r.email, 'sync_broken', jsonb_build_object('last_at', r.last_at, 'days', floor(extract(epoch from (now() - r.last_at)) / 86400))) on conflict (user_id, kind) do nothing;
    queued_sync := queued_sync + 1;
  end loop;
  return jsonb_build_object('trial_ending', queued_trial, 'sync_broken', queued_sync);
end $$;
revoke all on function public.email_queue_tick() from public, anon, authenticated;
