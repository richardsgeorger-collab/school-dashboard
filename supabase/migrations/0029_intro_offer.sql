-- 2026-10-09 (George): the intro offer. Max is $2.99 for the first month (a Stripe coupon, $5 off once, applied at
-- checkout), then $7.99; only for an account finishing its free week that has never paid; one use. The webhook
-- stamps intro_offer_at when the checkout with the coupon completes; Admin counts uses and who stayed past month one.
alter table public.profiles add column if not exists intro_offer_at timestamptz;

-- Whether the signed-in account may take the offer now.
create or replace function public.intro_offer_state() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.profiles%rowtype;
  paid boolean;
begin
  if me is null then return jsonb_build_object('eligible', false, 'why', 'signed_out'); end if;
  select * into p from public.profiles where user_id = me;
  if p.user_id is null then return jsonb_build_object('eligible', false, 'why', 'no_profile'); end if;
  if p.intro_offer_at is not null then return jsonb_build_object('eligible', false, 'why', 'used', 'used_at', p.intro_offer_at); end if;
  if p.trial_started_at is null then return jsonb_build_object('eligible', false, 'why', 'no_trial'); end if;
  select exists (select 1 from public.subscriptions s where s.user_id = me) into paid;
  if paid or p.stripe_customer_id is not null and exists (select 1 from public.subscriptions s where s.user_id = me) then return jsonb_build_object('eligible', false, 'why', 'paid_before'); end if;
  return jsonb_build_object('eligible', true);
end $$;
grant execute on function public.intro_offer_state() to authenticated;

-- Admin: how many took the offer, how many are still on Max past their first month, how many left.
create or replace function public.admin_intro_offer() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with u as (
      select p.user_id, p.intro_offer_at, s.status, s.current_period_end, s.cancel_at_period_end
      from public.profiles p left join public.subscriptions s on s.user_id = p.user_id
      where p.intro_offer_at is not null and not public.is_test_account(p.user_id)
    )
    select jsonb_build_object(
      'used', (select count(*) from u),
      'in_first_month', (select count(*) from u where intro_offer_at > now() - interval '31 days'),
      'stayed', (select count(*) from u where intro_offer_at <= now() - interval '31 days' and status in ('active', 'past_due') and coalesce(cancel_at_period_end, false) = false),
      'left', (select count(*) from u where intro_offer_at <= now() - interval '31 days' and not (status in ('active', 'past_due') and coalesce(cancel_at_period_end, false) = false))
    )
  );
end $$;
grant execute on function public.admin_intro_offer() to authenticated;
