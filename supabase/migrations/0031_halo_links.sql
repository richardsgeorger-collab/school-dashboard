-- 2026-10-11 (George): one Halo student, one Halo+ account, with a way to move it.
-- Loop 227 refused a sync when another account held the same Halo class ids. Class ids are sections, shared by every
-- student in the class, so classmates blocked each other (George by two real ESG-162L classmates, a real student by a
-- classmate all day). The identity is the Halo *student* now: the sync script sends a hash of the Halo session's
-- identity (never the identity itself), and a link says which Halo+ account it belongs to.
--   * A real account syncing an unlinked Halo links it. A test account never links, and never claims a Halo that a real
--     account holds.
--   * A real account syncing a Halo linked to another real account gets a move offer (the sync itself, kept 15 minutes):
--     Halo+ asks "This Halo account is linked to ge***@gmail.com. Move it to this account?" Moving needs that offer,
--     i.e. a sync just read from a live Halo session through this account's own sync key, plus being signed in here.
--     The old account's Halo data is cleared, it stops syncing that Halo, and Admin > Errors gets a note.

create table if not exists public.halo_links (
  halo_user text primary key check (halo_user ~ '^[0-9a-f]{40}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_ids text[] not null default '{}',
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  via text
);
create index if not exists halo_links_user on public.halo_links (user_id);
alter table public.halo_links enable row level security;
revoke all on table public.halo_links from public, anon, authenticated;

create table if not exists public.halo_move_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  halo_user text not null,
  holder uuid not null,
  holder_masked text not null,
  class_codes text[] not null default '{}',
  class_ids text[] not null default '{}',
  payload jsonb,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  unique (user_id, halo_user)
);
alter table public.halo_move_offers enable row level security;
drop policy if exists "own offers" on public.halo_move_offers;
create policy "own offers" on public.halo_move_offers for select to authenticated using (user_id = auth.uid());
drop policy if exists "dismiss own offers" on public.halo_move_offers;
create policy "dismiss own offers" on public.halo_move_offers for delete to authenticated using (user_id = auth.uid());
revoke insert, update on table public.halo_move_offers from anon, authenticated;

-- A test account for Halo links: marked Test, or a scripts address (.invalid). Not the owner rule that keeps George's own
-- account out of the analytics: his main account is a real Halo owner.
create or replace function public.link_test(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.test_override from public.profiles p where p.user_id = uid), (select u.email ~* '\.invalid$' from auth.users u where u.id = uid), false);
$$;
revoke all on function public.link_test(uuid) from public, anon, authenticated;

create or replace function public.mask_email(e text) returns text language sql immutable as $$
  select case when e is null or position('@' in e) = 0 then 'another account' else left(split_part(e, '@', 1), 2) || '***@' || split_part(e, '@', 2) end;
$$;

-- The old holder's copy of that Halo: its classes and their items tombstoned, its posts gone, its pulls and mailbox emptied.
create or replace function public.halo_clear_holder(uid uuid, p_class_ids text[]) returns int language plpgsql security definer set search_path = public as $$
declare
  cids text[];
  n int;
begin
  select coalesce(array_agg(id::text), '{}') into cids from public.courses where user_id = uid and deleted_at is null and data->>'haloClassId' = any(p_class_ids);
  update public.items set data = jsonb_build_object('id', id), deleted_at = now(), updated_at = now() where user_id = uid and deleted_at is null and data->>'courseId' = any(cids);
  update public.courses set data = jsonb_build_object('id', id), deleted_at = now(), updated_at = now() where user_id = uid and id::text = any(cids);
  get diagnostics n = row_count;
  delete from public.announcements where user_id = uid and course_id::text = any(cids);
  delete from public.pending_syncs where user_id = uid;
  update public.settings set data = (data - 'lastPull') || jsonb_build_object('haloPulls', coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(data->'haloPulls', '{}'::jsonb)) as e(k, v) where not (k = any(cids))), '{}'::jsonb), 'updatedAt', now()), updated_at = now() where user_id = uid;
  return n;
end $$;
revoke all on function public.halo_clear_holder(uuid, text[]) from public, anon, authenticated;

-- The move itself: link to the new account, clear the old one, note it for Admin.
create or replace function public.halo_move(p_halo_user text, p_to uuid, p_class_ids text[], p_how text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  old uuid;
  cleared int := 0;
  ids text[];
begin
  select user_id, class_ids into old, ids from public.halo_links where halo_user = p_halo_user;
  ids := coalesce(p_class_ids, '{}') || coalesce(ids, '{}');
  if old is not null and old <> p_to then cleared := public.halo_clear_holder(old, ids); end if;
  insert into public.halo_links (halo_user, user_id, class_ids, linked_at, last_seen_at, via) values (p_halo_user, p_to, coalesce(p_class_ids, '{}'), now(), now(), p_how)
  on conflict (halo_user) do update set user_id = excluded.user_id, class_ids = excluded.class_ids, linked_at = now(), last_seen_at = now(), via = excluded.via;
  if old is not null and old <> p_to then
    perform public.error_record(jsonb_build_object('fingerprint', 'halo-link:moved', 'kind', 'server', 'title', 'A Halo account moved to another Halo+ account', 'place', 'halo links', 'message',
      format('%s → %s (%s); %s classes cleared from the old account', public.mask_email((select email from auth.users where id = old)), public.mask_email((select email from auth.users where id = p_to)), p_how, cleared),
      'details', jsonb_build_object('from', old, 'to', p_to, 'how', p_how, 'cleared', cleared)));
  end if;
  return jsonb_build_object('ok', true, 'from', old, 'cleared', cleared);
end $$;
revoke all on function public.halo_move(text, uuid, text[], text) from public, anon, authenticated;

-- The student presses Move on an offer: signed in here, and the offer is a sync just read from their live Halo session.
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
  if o.payload is not null then
    insert into public.pending_syncs (user_id, payload, bytes) values (me, o.payload, length(o.payload::text)) returning id into row_id;
    delete from public.pending_syncs where user_id = me and id <> row_id;
  end if;
  delete from public.halo_move_offers where user_id = me and halo_user = o.halo_user;
  return r || jsonb_build_object('delivered', o.payload is not null);
end $$;
grant execute on function public.halo_claim(uuid) to authenticated;

-- A sync handed straight to the tab (the bookmark, an older extension): where its Halo belongs, linking it when free.
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
    return jsonb_build_object('state', 'other', 'holder_masked', public.mask_email((select email from auth.users where id = holder)), 'can_move', not public.link_test(me));
  end if;
  if not public.link_test(me) then perform public.halo_move(p_halo_user, me, p_class_ids, 'tab'); end if;
  return jsonb_build_object('state', 'free');
end $$;
grant execute on function public.halo_link_state(text, text[]) to authenticated;

-- The tab-path move: the export is the live-session proof, so it must be fresh.
create or replace function public.halo_claim_direct(p_halo_user text, p_class_ids text[], p_exported_at timestamptz) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  holder uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'why', 'Sign in first.'); end if;
  if p_halo_user !~ '^[0-9a-f]{40}$' then return jsonb_build_object('ok', false, 'why', 'No Halo account in that sync.'); end if;
  if p_exported_at is null or p_exported_at < now() - interval '15 minutes' or p_exported_at > now() + interval '5 minutes' then return jsonb_build_object('ok', false, 'why', 'Sync from Halo again, then move.'); end if;
  select user_id into holder from public.halo_links where halo_user = p_halo_user;
  if public.link_test(me) and holder is not null and not public.link_test(holder) then return jsonb_build_object('ok', false, 'why', 'A test account cannot take a student''s Halo account.'); end if;
  return public.halo_move(p_halo_user, me, p_class_ids, 'student');
end $$;
grant execute on function public.halo_claim_direct(text, text[], timestamptz) to authenticated;

-- Admin: look up links by an account's email or a link's first characters; move one; unlink one.
create or replace function public.admin_halo_links(p_query text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('halo_user', l.halo_user, 'email', u.email, 'test', public.link_test(l.user_id), 'linked_at', l.linked_at, 'last_seen_at', l.last_seen_at, 'via', l.via,
      'classes', (select coalesce(jsonb_agg(distinct c.data->>'code'), '[]'::jsonb) from public.courses c where c.user_id = l.user_id and c.deleted_at is null and c.data->>'haloClassId' = any(l.class_ids)),
      'offers', (select count(*) from public.halo_move_offers o where o.halo_user = l.halo_user and o.expires_at > now())) order by l.last_seen_at desc)
    from public.halo_links l join auth.users u on u.id = l.user_id
    where coalesce(trim(p_query), '') = '' or u.email ilike '%' || trim(p_query) || '%' or l.halo_user like lower(trim(p_query)) || '%'
    limit 50), '[]'::jsonb);
end $$;
grant execute on function public.admin_halo_links(text) to authenticated;

create or replace function public.admin_halo_move(p_halo_user text, p_to_email text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  dest uuid;
  holder uuid;
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  select id into dest from auth.users where lower(email) = lower(trim(p_to_email));
  if dest is null then return jsonb_build_object('ok', false, 'why', 'No account with that email.'); end if;
  select user_id into holder from public.halo_links where halo_user = p_halo_user;
  if holder is null then return jsonb_build_object('ok', false, 'why', 'No such link.'); end if;
  if public.link_test(dest) and not public.link_test(holder) then return jsonb_build_object('ok', false, 'why', 'A test account cannot take a student''s Halo account.'); end if;
  return public.halo_move(p_halo_user, dest, null, 'admin');
end $$;
grant execute on function public.admin_halo_move(text, text) to authenticated;

create or replace function public.admin_halo_unlink(p_halo_user text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  delete from public.halo_links where halo_user = p_halo_user;
  delete from public.halo_move_offers where halo_user = p_halo_user;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.admin_halo_unlink(text) to authenticated;
