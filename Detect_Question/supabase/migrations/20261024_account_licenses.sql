create extension if not exists pgcrypto;

create table if not exists public.license_accounts (
  student_id text primary key check (student_id ~ '^[A-Za-z0-9._-]{3,64}$'),
  display_name text,
  is_active boolean not null default true,
  active_device_hash text,
  active_session_hash text,
  session_expires_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.license_accounts enable row level security;

create or replace function public.is_license_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'license_admin';
$$;

create policy "license admins manage accounts"
on public.license_accounts for all
using (public.is_license_admin())
with check (public.is_license_admin());

create or replace function public.claim_license_device(
  p_student_id text,
  p_device_hash text,
  p_session_hash text,
  p_expires_at timestamptz
) returns table (allowed boolean, reason text, display_name text)
language plpgsql security definer set search_path = public as $$
declare account public.license_accounts%rowtype;
begin
  select * into account from public.license_accounts where student_id = p_student_id for update;
  if not found then return query select false, 'ACCOUNT_NOT_FOUND', null::text; return; end if;
  if not account.is_active then return query select false, 'ACCOUNT_DISABLED', account.display_name; return; end if;
  if account.active_device_hash is not null and account.active_device_hash <> p_device_hash
    and coalesce(account.session_expires_at, now()) > now() then
    return query select false, 'DEVICE_IN_USE', account.display_name; return;
  end if;
  update public.license_accounts set
    active_device_hash = p_device_hash,
    active_session_hash = p_session_hash,
    session_expires_at = p_expires_at,
    last_seen_at = now(), updated_at = now()
  where student_id = p_student_id;
  return query select true, 'OK', account.display_name;
end;
$$;

create or replace function public.reset_license_device(p_student_id text)
returns void language sql security definer set search_path = public as $$
  update public.license_accounts set active_device_hash = null, active_session_hash = null,
    session_expires_at = null, updated_at = now() where student_id = p_student_id;
$$;

revoke all on function public.claim_license_device(text, text, text, timestamptz) from public;
revoke all on function public.reset_license_device(text) from public;
