-- Referral rewards and the grace period: a month of Plus for both sides of an invite, and the columns the Stripe
-- webhook writes. Safe to run more than once.

alter table public.profiles
  add column if not exists reward_tier text check (reward_tier in ('plus', 'pro', 'max')),
  add column if not exists reward_until timestamptz;

-- The client still may not touch any of the plan columns.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.tier := old.tier;
    new.trial_ends_at := old.trial_ends_at;
    new.grace_until := old.grace_until;
    new.stripe_customer_id := old.stripe_customer_id;
    new.is_admin := old.is_admin;
    new.referral_code := old.referral_code;
    new.referred_by := old.referred_by;
    new.reward_tier := old.reward_tier;
    new.reward_until := old.reward_until;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Invite a friend: the invitee calls this once, signed in, with the inviter's code. Both get thirty days of Plus,
-- stacked onto any Plus reward already running. Never downgrades anyone already on a bigger reward.
create or replace function public.claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inviter uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select user_id into inviter from public.profiles where referral_code = lower(trim(p_code));
  if inviter is null then return jsonb_build_object('ok', false, 'why', 'That invite code does not exist.'); end if;
  if inviter = me then return jsonb_build_object('ok', false, 'why', 'That is your own code.'); end if;
  if exists (select 1 from public.referrals where invitee = me) then return jsonb_build_object('ok', false, 'why', 'This account was already invited.'); end if;
  insert into public.referrals (inviter, invitee, rewarded_at) values (inviter, me, now());
  update public.profiles set referred_by = inviter where user_id = me;
  update public.profiles
     set reward_tier = 'plus',
         reward_until = greatest(coalesce(reward_until, now()), now()) + interval '30 days'
   where user_id in (inviter, me) and (reward_tier is null or reward_tier = 'plus');
  return jsonb_build_object('ok', true);
end $$;
