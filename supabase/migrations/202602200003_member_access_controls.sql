begin;

alter table public.workspace_members
  add column if not exists access_disabled boolean not null default false;

create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.access_disabled = false
  );
$$;

create or replace function public.is_workspace_admin(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin'
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.access_disabled = false
  ), false);
$$;

create or replace function public.can_manage_users(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin' or wm.can_manage_users
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.access_disabled = false
  ), false);
$$;

create or replace function public.can_manage_categories(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin' or wm.can_manage_categories
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.access_disabled = false
  ), false);
$$;

create or replace function public.can_delete_entries(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin' or wm.can_delete_entries
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.access_disabled = false
  ), false);
$$;

drop function if exists public.list_workspace_members(uuid);

create or replace function public.list_workspace_members(_workspace_id uuid)
returns table (
  workspace_id uuid,
  user_id uuid,
  role public.app_role,
  can_delete_entries boolean,
  can_manage_categories boolean,
  can_manage_users boolean,
  dashboard_scope public.dashboard_scope,
  access_disabled boolean,
  full_name text,
  email text,
  phone text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_users(_workspace_id) then
    raise exception 'Not allowed to view workspace members';
  end if;

  return query
  select
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.can_delete_entries,
    wm.can_manage_categories,
    wm.can_manage_users,
    wm.dashboard_scope,
    wm.access_disabled,
    p.full_name,
    au.email,
    coalesce(p.phone, nullif(au.phone, ''))
  from public.workspace_members wm
  left join public.profiles p
    on p.id = wm.user_id
  left join auth.users au
    on au.id = wm.user_id
  where wm.workspace_id = _workspace_id
  order by
    case when wm.role = 'admin' then 0 else 1 end,
    wm.access_disabled,
    coalesce(p.full_name, au.email, wm.user_id::text);
end;
$$;

create or replace function public.set_workspace_member_access_disabled(
  _workspace_id uuid,
  _target_user_id uuid,
  _disabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role public.app_role;
  v_target_disabled boolean;
  v_active_admin_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_workspace_admin(_workspace_id) then
    raise exception 'Only admin can change workspace access';
  end if;

  if _target_user_id = auth.uid() then
    raise exception 'Admin cannot disable self';
  end if;

  select wm.role, wm.access_disabled
    into v_target_role, v_target_disabled
  from public.workspace_members wm
  where wm.workspace_id = _workspace_id
    and wm.user_id = _target_user_id;

  if v_target_role is null then
    raise exception 'User is not part of this workspace';
  end if;

  if _disabled and v_target_role = 'admin' and coalesce(v_target_disabled, false) = false then
    select count(*)
      into v_active_admin_count
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.role = 'admin'
      and wm.access_disabled = false;

    if v_active_admin_count <= 1 then
      raise exception 'Cannot disable the last active admin';
    end if;
  end if;

  update public.workspace_members
     set access_disabled = _disabled,
         updated_at = now()
   where workspace_id = _workspace_id
     and user_id = _target_user_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    meta
  )
  values (
    _workspace_id,
    auth.uid(),
    case when _disabled then 'workspace_member_temporarily_disabled' else 'workspace_member_access_restored' end,
    'workspace_member',
    _target_user_id,
    jsonb_build_object(
      'target_user_id', _target_user_id,
      'disabled', _disabled
    )
  );
end;
$$;

create or replace function public.remove_workspace_member(
  _workspace_id uuid,
  _target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role public.app_role;
  v_target_disabled boolean;
  v_active_admin_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_workspace_admin(_workspace_id) then
    raise exception 'Only admin can remove users';
  end if;

  if _target_user_id = auth.uid() then
    raise exception 'Admin cannot remove self';
  end if;

  select wm.role, wm.access_disabled
    into v_target_role, v_target_disabled
  from public.workspace_members wm
  where wm.workspace_id = _workspace_id
    and wm.user_id = _target_user_id;

  if v_target_role is null then
    raise exception 'User is not part of this workspace';
  end if;

  if v_target_role = 'admin' and coalesce(v_target_disabled, false) = false then
    select count(*)
      into v_active_admin_count
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.role = 'admin'
      and wm.access_disabled = false;

    if v_active_admin_count <= 1 then
      raise exception 'Cannot remove the last active admin from workspace';
    end if;
  end if;

  delete from public.workspace_members
   where workspace_id = _workspace_id
     and user_id = _target_user_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    meta
  )
  values (
    _workspace_id,
    auth.uid(),
    'workspace_member_revoked',
    'workspace_member',
    _target_user_id,
    jsonb_build_object('removed_user_id', _target_user_id)
  );
end;
$$;

grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.set_workspace_member_access_disabled(uuid, uuid, boolean) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

commit;
