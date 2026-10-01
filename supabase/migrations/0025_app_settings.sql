-- Settings George changes from Admin without a deploy (2026-10-01). First: the Chrome extension's Web Store address,
-- which turns on every "Add to Chrome" / "Enable auto-sync" offer (desktop Chrome, Edge and Brave).
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value) values ('extension_url', 'https://chromewebstore.google.com/detail/halo+/dookepepmkkakmepjabldmgfmfhfcmnn')
  on conflict (key) do nothing;

-- Anyone may read a public setting (the store address is public); only these keys.
create or replace function public.app_setting(p_key text) returns text language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key and p_key in ('extension_url');
$$;
grant execute on function public.app_setting(text) to anon, authenticated;

create or replace function public.admin_set_setting(p_key text, p_value text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_me() then raise exception 'admins only'; end if;
  if p_key not in ('extension_url') then raise exception 'unknown setting'; end if;
  if p_key = 'extension_url' and nullif(trim(p_value), '') is not null and trim(p_value) !~ '^https://(chromewebstore\.google\.com|chrome\.google\.com/webstore)/' then
    raise exception 'That is not a Chrome Web Store address.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by) values (p_key, nullif(trim(p_value), ''), now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;
grant execute on function public.admin_set_setting(text, text) to authenticated;
