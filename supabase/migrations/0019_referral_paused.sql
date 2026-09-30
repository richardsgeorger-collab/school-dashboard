-- George, 2026-09-30: a paying inviter's referral month is a 30-day billing pause at Stripe, not Plus days, so "You've
-- earned 30 days of Plus" was wrong for them. my_referrals now says how many of the joins were pauses.
create or replace function public.my_referrals() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'joined', (select count(*) from public.referrals where inviter = auth.uid()),
    'days', 30 * (select count(*) from public.referrals where inviter = auth.uid()),
    'paused', (select count(*) from public.referrals where inviter = auth.uid() and inviter_reward like 'stripe_pause%'),
    'next_starts', (select min(starts_at) from public.reward_grants where user_id = auth.uid() and starts_at > now()),
    'running_until', (select max(ends_at) from public.reward_grants where user_id = auth.uid() and starts_at <= now() and ends_at > now()),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('tier', tier, 'starts', starts_at, 'ends', ends_at, 'source', source) order by starts_at) from public.reward_grants where user_id = auth.uid() and ends_at > now()), '[]'::jsonb)
  );
$$;
grant execute on function public.my_referrals() to authenticated;
