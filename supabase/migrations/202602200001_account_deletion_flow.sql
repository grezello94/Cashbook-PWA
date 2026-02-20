begin;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token text not null unique,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  constraint account_deletion_requests_status_chk check (status in ('pending', 'confirmed', 'cancelled', 'expired'))
);

create unique index if not exists account_deletion_requests_one_pending_user_idx
  on public.account_deletion_requests(user_id)
  where status = 'pending';

create table if not exists public.account_deletion_archive (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text not null,
  profile_snapshot jsonb not null,
  memberships_snapshot jsonb not null,
  archived_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_archive enable row level security;

create policy account_deletion_requests_select_own
on public.account_deletion_requests
for select
to authenticated
using (user_id = auth.uid());

create policy account_deletion_requests_insert_own
on public.account_deletion_requests
for insert
to authenticated
with check (user_id = auth.uid());

create policy account_deletion_requests_update_own
on public.account_deletion_requests
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.request_account_deletion(
  _email text,
  _token text,
  _expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_auth_email text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select au.email
    into v_auth_email
  from auth.users au
  where au.id = v_user_id;

  if v_auth_email is null then
    raise exception 'No email linked to this account';
  end if;

  if lower(coalesce(_email, '')) <> lower(v_auth_email) then
    raise exception 'Email does not match signed-in account';
  end if;

  if _token is null or btrim(_token) = '' then
    raise exception 'Token is required';
  end if;

  if _expires_at is null or _expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  update public.account_deletion_requests
     set status = 'cancelled'
   where user_id = v_user_id
     and status = 'pending';

  insert into public.account_deletion_requests (
    user_id,
    email,
    token,
    status,
    expires_at,
    meta
  )
  values (
    v_user_id,
    v_auth_email,
    _token,
    'pending',
    _expires_at,
    jsonb_build_object('requested_from', 'cashbook_pwa')
  );
end;
$$;

create or replace function public.confirm_account_deletion(
  _token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.account_deletion_requests%rowtype;
  v_profile_snapshot jsonb;
  v_memberships_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_request
  from public.account_deletion_requests adr
  where adr.user_id = v_user_id
    and adr.token = _token
    and adr.status = 'pending'
  limit 1;

  if not found then
    raise exception 'Invalid or expired deletion link';
  end if;

  if v_request.expires_at < now() then
    update public.account_deletion_requests
       set status = 'expired'
     where id = v_request.id;
    raise exception 'Deletion link has expired';
  end if;

  select to_jsonb(p.*)
    into v_profile_snapshot
  from public.profiles p
  where p.id = v_user_id;

  select coalesce(jsonb_agg(to_jsonb(wm.*)), '[]'::jsonb)
    into v_memberships_snapshot
  from public.workspace_members wm
  where wm.user_id = v_user_id;

  insert into public.account_deletion_archive (
    user_id,
    email,
    profile_snapshot,
    memberships_snapshot
  )
  values (
    v_user_id,
    v_request.email,
    coalesce(v_profile_snapshot, '{}'::jsonb),
    v_memberships_snapshot
  );

  update public.profiles
     set deleted_at = now(),
         updated_at = now()
   where id = v_user_id;

  delete from public.workspace_members
   where user_id = v_user_id;

  update public.account_deletion_requests
     set status = 'confirmed',
         confirmed_at = now()
   where id = v_request.id;

  return true;
end;
$$;

grant execute on function public.request_account_deletion(text, text, timestamptz) to authenticated;
grant execute on function public.confirm_account_deletion(text) to authenticated;

commit;
