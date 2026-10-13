-- 2026-10-12 (review of loop 236): a move never destroys anything. The Halo student is identified by a hash the student's
-- own browser computes from the Halo session, which the server cannot check, and a GCU email is easy to guess: so a move
-- that cleared the old account's classes let anyone who knew a classmate's address wipe their synced work. A move now
-- only relinks; the old account keeps what it has, stops receiving that Halo's syncs, and Admin > Errors gets a note.
-- At most three moves a day per account.
create or replace function public.halo_move(p_halo_user text, p_to uuid, p_class_ids text[], p_how text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  old uuid;
  recent int;
begin
  select user_id into old from public.halo_links where halo_user = p_halo_user;
  if old is not null and old <> p_to and p_how in ('student', 'tab') then
    select count(*) into recent from public.error_events where fingerprint = 'halo-link:moved' and created_at > now() - interval '1 day' and details->>'to' = p_to::text;
    if recent >= 3 then return jsonb_build_object('ok', false, 'why', 'Too many moves today. Try again tomorrow, or write to support.'); end if;
  end if;
  insert into public.halo_links (halo_user, user_id, class_ids, linked_at, last_seen_at, via) values (p_halo_user, p_to, coalesce(p_class_ids, '{}'), now(), now(), p_how)
  on conflict (halo_user) do update set user_id = excluded.user_id, class_ids = excluded.class_ids, linked_at = now(), last_seen_at = now(), via = excluded.via;
  if old is not null and old <> p_to then
    perform public.error_record(jsonb_build_object('fingerprint', 'halo-link:moved', 'kind', 'server', 'title', 'A Halo account moved to another Halo+ account', 'place', 'halo links', 'message',
      format('%s → %s (%s); nothing deleted', public.mask_email((select email from auth.users where id = old)), public.mask_email((select email from auth.users where id = p_to)), p_how),
      'details', jsonb_build_object('from', old, 'to', p_to, 'how', p_how)));
  end if;
  return jsonb_build_object('ok', true, 'from', old, 'cleared', 0);
end $$;
revoke all on function public.halo_move(text, uuid, text[], text) from public, anon, authenticated;

-- The destructive helper is gone.
drop function if exists public.halo_clear_holder(uuid, text[]);

-- halo_claim: the move's answer now carries "ok: false" through (the daily limit).
create or replace function public.halo_claim(p_offer uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  o public.halo_move_offers%rowtype;
  r jsonb;
  row_id uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'why', 'Sign in first.'); end if;
  select * into o from public.halo_move_offers where id = p_offer and user_id = me;
  if o.id is null then return jsonb_build_object('ok', false, 'why', 'That move is no longer waiting. Sync from Halo again.'); end if;
  if o.expires_at < now() then
    delete from public.halo_move_offers where id = o.id;
    return jsonb_build_object('ok', false, 'why', 'That was more than 15 minutes ago. Sync from Halo again, then move.');
  end if;
  if public.link_test(me) and not public.link_test(o.holder) then return jsonb_build_object('ok', false, 'why', 'A test account cannot take a student''s Halo account.'); end if;
  r := public.halo_move(o.halo_user, me, o.class_ids, 'student');
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  if o.payload is not null then
    insert into public.pending_syncs (user_id, payload, bytes) values (me, o.payload, length(o.payload::text)) returning id into row_id;
    delete from public.pending_syncs where user_id = me and id <> row_id;
  end if;
  delete from public.halo_move_offers where user_id = me and halo_user = o.halo_user;
  return r || jsonb_build_object('delivered', o.payload is not null);
end $$;
grant execute on function public.halo_claim(uuid) to authenticated;
