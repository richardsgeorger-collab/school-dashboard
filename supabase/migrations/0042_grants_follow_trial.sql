-- Referral Plus credit follows the trial (2026-10-23). A credit is queued to start when the free trial ends
-- (reward_start), but the trial's end moves now: an unsynced trial is held open (0037), the first sync starts it, days
-- of use end it (0040). A credit queued at the old end then ran under Max (two real students lost 10–16 days of it) or
-- read as "when your paid plan ends". Now whenever trial_ends_at changes on a running trial, the credits that have not
-- really begun (queued, or running while the trial still runs) are lined up again right after everything that comes
-- first, back to back, each keeping its length. Never shorter, never before now.

create or replace function public.requeue_grants(uid uuid) returns int language plpgsql security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  cursor_at timestamptz;
  g record;
  n int := 0;
begin
  select * into p from public.profiles where user_id = uid;
  if p.user_id is null then return 0; end if;
  cursor_at := greatest(
    now(),
    coalesce(p.trial_ends_at, now()),
    case when p.reward_tier is not null then coalesce(p.reward_until, now()) else now() end,
    coalesce((select current_period_end from public.subscriptions s where s.user_id = uid and s.cancel_at_period_end and s.status in ('active', 'trialing', 'past_due')), now()),
    -- A credit that began after the trial ended keeps running; the queue goes after it.
    coalesce((select max(ends_at) from public.reward_grants r where r.user_id = uid and r.starts_at <= now() and r.ends_at > now()
              and not (p.trial_ends_at > now() and r.starts_at < p.trial_ends_at)), now())
  );
  for g in
    select id, starts_at, ends_at from public.reward_grants r
    where r.user_id = uid and r.ends_at > now()
      and (r.starts_at > now() or (p.trial_ends_at > now() and r.starts_at < p.trial_ends_at))
    order by r.starts_at, r.created_at
  loop
    if g.starts_at is distinct from cursor_at then
      update public.reward_grants set starts_at = cursor_at, ends_at = cursor_at + (g.ends_at - g.starts_at) where id = g.id;
      n := n + 1;
    end if;
    cursor_at := cursor_at + (g.ends_at - g.starts_at);
  end loop;
  return n;
end $$;
revoke all on function public.requeue_grants(uuid) from public, anon, authenticated;

create or replace function public.grants_follow_trial() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.trial_ends_at is not null and old.trial_ends_at > now() and exists (select 1 from public.reward_grants r where r.user_id = new.user_id and r.ends_at > now()) then
    perform public.requeue_grants(new.user_id);
  end if;
  return null;
end $$;
drop trigger if exists grants_follow_trial on public.profiles;
create trigger grants_follow_trial after update of trial_ends_at on public.profiles
  for each row when (old.trial_ends_at is distinct from new.trial_ends_at) execute function public.grants_follow_trial();

-- Today's credits: everyone whose trial is still running and has a credit to line up.
select public.requeue_grants(p.user_id)
from public.profiles p
where p.trial_ends_at > now() and exists (select 1 from public.reward_grants r where r.user_id = p.user_id and r.ends_at > now());
