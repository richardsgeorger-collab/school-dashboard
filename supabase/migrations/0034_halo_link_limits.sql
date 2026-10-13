-- 2026-10-12 (second review of loop 236): a link no longer blocks delivery (sync-drop lands every sync in the account whose
-- key sent it), so a link is only a question. Two leftovers are capped here:
--  * the "free" path linked any unlinked Halo to the asking account with no limit: an account now holds at most two
--    Halo links that way (a student has one Halo account);
--  * asking about a hash that belongs to someone else answers with their masked email, which tells a guesser that a GCU
--    address has a Halo+ account: at most ten different Halos a day per account get that answer.
create table if not exists public.halo_link_lookups (
  user_id uuid not null references auth.users(id) on delete cascade,
  halo_user text not null,
  at timestamptz not null default now(),
  primary key (user_id, halo_user)
);
alter table public.halo_link_lookups enable row level security;

-- True when this account may be told who holds this Halo (records the ask).
create or replace function public.halo_lookup_ok(p_uid uuid, p_halo_user text) returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.halo_link_lookups where user_id = p_uid and at < now() - interval '1 day';
  insert into public.halo_link_lookups (user_id, halo_user) values (p_uid, p_halo_user) on conflict (user_id, halo_user) do nothing;
  select count(*) into n from public.halo_link_lookups where user_id = p_uid;
  return n <= 10;
end $$;
revoke all on function public.halo_lookup_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.halo_lookup_ok(uuid, text) to service_role;

create or replace function public.halo_link_state(p_halo_user text, p_class_ids text[] default '{}') returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  holder uuid;
begin
  if me is null then return jsonb_build_object('state', 'signed_out'); end if;
  if p_halo_user !~ '^[0-9a-f]{40}$' then return jsonb_build_object('state', 'unknown'); end if;
  select user_id into holder from public.halo_links where halo_user = p_halo_user;
  if holder = me then
    update public.halo_links set last_seen_at = now(), class_ids = coalesce(p_class_ids, class_ids) where halo_user = p_halo_user;
    return jsonb_build_object('state', 'mine');
  end if;
  if holder is not null and exists (select 1 from public.profiles where user_id = holder) and not public.link_test(holder) then
    if not public.halo_lookup_ok(me, p_halo_user) then return jsonb_build_object('state', 'unknown'); end if;
    return jsonb_build_object('state', 'other', 'holder_masked', public.mask_email((select email from auth.users where id = holder)), 'can_move', not public.link_test(me));
  end if;
  if not public.link_test(me) and (select count(*) from public.halo_links where user_id = me) < 2 then perform public.halo_move(p_halo_user, me, p_class_ids, 'tab'); end if;
  return jsonb_build_object('state', 'free');
end $$;
grant execute on function public.halo_link_state(text, text[]) to authenticated;
