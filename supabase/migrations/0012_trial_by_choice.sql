-- George, 2026-09-28: new accounts start on Free. The Max trial is seven days, no card, once per account, and starts
-- only when the student chooses it (public.start_trial(), unchanged since 0010). Accounts already made keep whatever
-- trial they have; friend links are untouched (they grant Max through reward_tier, not the trial).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, tier, referral_code)
  values (new.id, 'free', encode(extensions.gen_random_bytes(4), 'hex'))
  on conflict (user_id) do nothing;
  return new;
end $$;
