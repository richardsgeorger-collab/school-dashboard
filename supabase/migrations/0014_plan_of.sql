-- George, 2026-09-28: friends who joined through a friend link have Max in the app but the AI function refused them,
-- because it worked out the plan from the paid tier and the trial only, never the friend grant. From here on ONE
-- function decides a student's plan, and every check (the AI function, the app) asks it.
-- The best of: what is paid for (kept through a failed-payment grace period), a live trial (Max), a live reward
-- (a friend link's Max, a referral's Plus), and admin (Max). 'pro' is retired and reads as Plus.

create or replace function public.plan_of(uid uuid) returns text language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  best int := 0;
  r int;
  names text[] := array['free', 'plus', 'pro', 'max'];
begin
  select * into p from public.profiles where user_id = uid;
  if p.user_id is null then return 'free'; end if;
  best := coalesce(array_position(names, p.tier), 1) - 1;
  if p.trial_ends_at is not null and p.trial_ends_at > now() then best := greatest(best, 3); end if;
  if p.reward_tier is not null and p.reward_until is not null and p.reward_until > now() then
    r := coalesce(array_position(names, p.reward_tier), 1) - 1;
    best := greatest(best, r);
  end if;
  if coalesce(p.is_admin, false) then best := 3; end if;
  return names[best + 1];
end $$;
revoke all on function public.plan_of(uuid) from public, anon, authenticated;

-- The student's own plan, for the app to show exactly what the server enforces.
create or replace function public.my_plan() returns text language sql stable security definer set search_path = public as $$
  select public.plan_of(auth.uid());
$$;
grant execute on function public.my_plan() to authenticated;
