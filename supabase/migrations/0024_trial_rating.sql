-- The end of the free week (2026-10-01): what Max did, in numbers from the server (so they are the same on every
-- device), and a 1 to 10 "How much did Halo+ help this week?" that George sees on Admin.

-- What the week's AI did for this account: questions answered, practice sets built, announcements read and the
-- requirements found in them. Only the caller's own rows.
create or replace function public.my_trial_recap(p_since timestamptz, p_until timestamptz) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'asked', (select count(*) from public.usage_log where user_id = auth.uid() and created_at between p_since and p_until and kind in ('coach', 'tutor', 'brief', 'draft', 'method', 'other')),
    'practice', (select count(*) from public.usage_log where user_id = auth.uid() and created_at between p_since and p_until and kind in ('study', 'quiz', 'worksheet')),
    'read', (select count(*) from public.read_ledger where user_id = auth.uid() and read_at between p_since and p_until),
    'found', (select coalesce(sum(action_count), 0) from public.read_ledger where user_id = auth.uid() and read_at between p_since and p_until)
  );
$$;
revoke all on function public.my_trial_recap(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_trial_recap(timestamptz, timestamptz) to authenticated;

-- One rating per account, at the end of the free week. A comment also lands in Feedback, where George reads them.
create table if not exists public.trial_ratings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rating int not null check (rating between 1 and 10),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trial_ratings enable row level security;

create or replace function public.rate_trial(p_rating int, p_comment text default null) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text := nullif(trim(left(coalesce(p_comment, ''), 2000)), '');
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 10 then raise exception 'rating is 1 to 10'; end if;
  insert into public.trial_ratings (user_id, rating, comment) values (me, p_rating, c)
    on conflict (user_id) do update set rating = excluded.rating, comment = coalesce(excluded.comment, public.trial_ratings.comment), updated_at = now();
  if c is not null then
    insert into public.feedback (user_id, kind, screen, text) values (me, 'feedback', '#trial-end', format('Free week rated %s/10: %s', p_rating, c));
  end if;
end $$;
revoke all on function public.rate_trial(int, text) from public, anon;
grant execute on function public.rate_trial(int, text) to authenticated;

-- For Admin: the average, how many, the spread, and the comments. Real students only.
create or replace function public.admin_trial_ratings() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return (
    with r as (select t.*, u.email from public.trial_ratings t join auth.users u on u.id = t.user_id where not public.is_test_account(t.user_id))
    select jsonb_build_object(
      'n', (select count(*) from r),
      'average', (select round(avg(rating)::numeric, 1) from r),
      'spread', (select coalesce(jsonb_object_agg(rating, n), '{}'::jsonb) from (select rating, count(*) n from r group by rating) s),
      'comments', (select coalesce(jsonb_agg(jsonb_build_object('rating', rating, 'comment', comment, 'email', email, 'at', updated_at) order by updated_at desc), '[]'::jsonb)
                     from (select * from r where comment is not null order by updated_at desc limit 50) c)
    )
  );
end $$;
grant execute on function public.admin_trial_ratings() to authenticated;
