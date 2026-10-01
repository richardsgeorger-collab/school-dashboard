-- The calendar feed (2026-10-01, Plus): a private link a student subscribes to in Google Calendar, Apple Calendar or
-- Outlook. The token in the link is the only key; the calendar function (service role) looks it up and serves that
-- account's due dates. Students never read this table directly: they get their own token through my_calendar_feed.
create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz
);
alter table public.calendar_feeds enable row level security;

-- The account's feed token (made on first ask), and when a calendar app last read it. `rotate` makes a new one:
-- every calendar subscribed to the old link stops updating.
create or replace function public.my_calendar_feed(rotate boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text; fetched timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  if rotate then
    t := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.calendar_feeds (user_id, token) values (me, t)
      on conflict (user_id) do update set token = excluded.token, created_at = now(), last_fetched_at = null;
  else
    select token, last_fetched_at into t, fetched from public.calendar_feeds where user_id = me;
    if t is null then
      t := encode(extensions.gen_random_bytes(24), 'hex');
      insert into public.calendar_feeds (user_id, token) values (me, t) on conflict (user_id) do nothing;
      select token, last_fetched_at into t, fetched from public.calendar_feeds where user_id = me;
    end if;
  end if;
  return jsonb_build_object('token', t, 'last_fetched_at', fetched);
end $$;
revoke all on function public.my_calendar_feed(boolean) from public, anon;
grant execute on function public.my_calendar_feed(boolean) to authenticated;
