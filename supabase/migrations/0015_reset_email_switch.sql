-- Password reset emails (2026-09-28). "Forgot password" only works once a real email sender (custom SMTP) is set in
-- Supabase; the built-in sender is rate-limited and not for production. Until George turns this switch on from the
-- admin screen, the sign-in screen says "Contact George to reset your password" instead of a link that silently fails.
insert into public.app_switches (name, enabled) values ('reset_email', false) on conflict (name) do nothing;

create or replace function public.reset_email_ready() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.app_switches where name = 'reset_email'), false);
$$;
grant execute on function public.reset_email_ready() to anon, authenticated;

create or replace function public.admin_set_switch(switch_name text, on_off boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  if switch_name not in ('server_sync_everyone', 'server_sync_kill', 'reset_email') then raise exception 'unknown switch'; end if;
  update public.app_switches set enabled = on_off, updated_at = now(), updated_by = auth.uid() where name = switch_name;
end $$;
grant execute on function public.admin_set_switch(text, boolean) to authenticated;
