-- 2026-10-27 (Loop 271, extension 0.12.0): Halo+ on Halo's own pages. Admin's "Users per feature" counts the students
-- who used each new on-Halo feature each week (the extension reports one moment per feature per page, at most 60 a
-- day, through the report function): search, Next, drafts offered or restored, the word minimum, the rubric, all
-- classes on the calendar, the submission check, last feedback, participation, files opened on the page.
create or replace function public.admin_feature_usage(p_weeks int default 4) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  return coalesce((
    with f(feature, pattern) as (values
      ('now', 'screen:now'), ('classes', 'screen:classes'), ('classes', 'screen:class'), ('calendar', 'screen:calendar'),
      ('study', 'screen:study'), ('study', 'screen:practice'), ('ask', 'screen:ask'), ('help_kit', 'helpkit:%'),
      ('changes_viewed', 'ann-change:view'), ('changes_viewed', 'locked:seen'), ('extension_panel', 'halo:week-%'),
      ('pill_clicks', 'halo:pill-click'), ('gpa', 'gpa:open'),
      ('on_halo_search', 'halo:search-%'), ('on_halo_next', 'halo:next-click'), ('on_halo_drafts', 'halo:draft-%'),
      ('on_halo_words', 'halo:words-shown'), ('on_halo_rubric', 'halo:rubric-open'), ('on_halo_calendar', 'halo:calendar-all'),
      ('on_halo_submit', 'halo:submit-shown'), ('on_halo_submit', 'halo:wrongtype-shown'), ('on_halo_feedback', 'halo:feedback-open'),
      ('on_halo_participation', 'halo:participation-shown'), ('on_halo_files', 'halo:file-open')
    ),
    rows as (
      select date_trunc('week', e.day::timestamp)::date as week, f.feature, e.user_id,
        case
          when p.tier in ('plus', 'pro', 'max') or (p.reward_tier is not null and p.reward_until::date >= e.day) then 'paid'
          when p.trial_synced_at is not null and (p.trial_ends_at at time zone 'America/Phoenix')::date >= e.day then 'trial'
          else 'free'
        end as grp
      from public.usage_events e
      join f on e.key like f.pattern
      join public.profiles p on p.user_id = e.user_id
      where e.day >= (date_trunc('week', (now() at time zone 'America/Phoenix')::date::timestamp) - make_interval(weeks => p_weeks - 1))::date
        and public.is_real_student(e.user_id)
    ),
    counted as (
      select week, feature, grp, count(distinct user_id) as n from rows group by 1, 2, 3
    ),
    by_week as (
      select week, jsonb_object_agg(feature || ':' || grp, n) as cells from counted group by 1
    )
    select jsonb_agg(jsonb_build_object('week', week, 'cells', cells) order by week desc) from by_week
  ), '[]'::jsonb);
end $$;
grant execute on function public.admin_feature_usage(int) to authenticated;
