-- 2026-10-27 (George): Plus gets a first-month offer like Max's: $0.99 the first month (a Stripe coupon, $4 off once),
-- then $4.99. Same rule as 0029: an account that started its free week and never paid, one intro per account (Plus or
-- Max, whichever it takes). The webhook now stamps which plan the intro was for; every intro before today was Max.
alter table public.profiles add column if not exists intro_offer_tier text;
alter table public.profiles drop constraint if exists profiles_intro_offer_tier_check;
alter table public.profiles add constraint profiles_intro_offer_tier_check check (intro_offer_tier is null or intro_offer_tier in ('plus', 'max'));
update public.profiles set intro_offer_tier = 'max' where intro_offer_at is not null and intro_offer_tier is null;

-- Admin: as before, plus the split by plan. "Stayed" means still paying past month one, on either plan.
create or replace function public.admin_intro_offer() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with u as (
      select p.user_id, p.intro_offer_at, coalesce(p.intro_offer_tier, 'max') as offer_tier, s.status, s.current_period_end, s.cancel_at_period_end
      from public.profiles p left join public.subscriptions s on s.user_id = p.user_id
      where p.intro_offer_at is not null and not public.is_test_account(p.user_id)
    )
    select jsonb_build_object(
      'used', (select count(*) from u),
      'used_plus', (select count(*) from u where offer_tier = 'plus'),
      'used_max', (select count(*) from u where offer_tier = 'max'),
      'in_first_month', (select count(*) from u where intro_offer_at > now() - interval '31 days'),
      'stayed', (select count(*) from u where intro_offer_at <= now() - interval '31 days' and status in ('active', 'past_due') and coalesce(cancel_at_period_end, false) = false),
      'left', (select count(*) from u where intro_offer_at <= now() - interval '31 days' and not (status in ('active', 'past_due') and coalesce(cancel_at_period_end, false) = false))
    )
  );
end $$;
grant execute on function public.admin_intro_offer() to authenticated;
