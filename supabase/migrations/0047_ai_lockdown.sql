-- AI lockdown (2026-10-29, George: "Fixed server-built jobs only, input caps, per-user rate limits, and stream mode
-- counted against the budget"). The AI function admits a call here before it calls the model: under a lock per student,
-- so calls sent at once are counted one by one (before, parallel calls could all pass the monthly ceiling), it checks
-- the kind's calls in the last minute and today and the month's spend plus this call's most it could cost, and holds
-- that most as a row in the usage log. After the call the function writes the real cost into that row (or removes it
-- when the model did not answer). A function that dies mid-call leaves the held amount counted: never a free call.
create index if not exists usage_log_user_created_idx on public.usage_log (user_id, created_at);

create or replace function public.ai_admit(
  p_user uuid,
  p_kind text,
  p_day date,
  p_month_start date,
  p_per_minute int,
  p_per_day int,
  p_ceiling numeric,
  p_estimate numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_minute int;
  n_day int;
  spent numeric;
  rid bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_admit:' || p_user::text, 0));
  select count(*) into n_minute from public.usage_log
    where user_id = p_user and kind = p_kind and created_at > now() - interval '60 seconds';
  if n_minute >= p_per_minute then
    return jsonb_build_object('ok', false, 'reason', 'minute');
  end if;
  select count(*) into n_day from public.usage_log
    where user_id = p_user and kind = p_kind and day = p_day;
  if n_day >= p_per_day then
    return jsonb_build_object('ok', false, 'reason', 'day');
  end if;
  select coalesce(sum(cost_usd), 0) into spent from public.usage_log
    where user_id = p_user and day >= p_month_start;
  if spent + p_estimate > p_ceiling then
    return jsonb_build_object('ok', false, 'reason', 'ceiling');
  end if;
  insert into public.usage_log (user_id, day, kind, model, cost_usd)
    values (p_user, p_day, p_kind, 'held', p_estimate)
    returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid);
end;
$$;

revoke all on function public.ai_admit(uuid, text, date, date, int, int, numeric, numeric) from public, anon, authenticated;
grant execute on function public.ai_admit(uuid, text, date, date, int, int, numeric, numeric) to service_role;
