create or replace function public.list_workspace_members(_workspace_id uuid)
returns table (
  workspace_id uuid,
  user_id uuid,
  role public.app_role,
  can_delete_entries boolean,
  can_manage_categories boolean,
  can_manage_users boolean,
  dashboard_scope public.dashboard_scope,
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
    coalesce(p.full_name, au.email, wm.user_id::text);
end;
$$;

create or replace function public.add_workspace_member_by_contact(
  _workspace_id uuid,
  _contact text,
  _role public.app_role default 'editor',
  _can_delete_entries boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_user_id uuid;
  v_contact text := btrim(_contact);
  v_contact_no_space text;
begin
  if not public.can_manage_users(_workspace_id) then
    raise exception 'Not allowed to manage users in this workspace';
  end if;

  if v_contact is null or v_contact = '' then
    raise exception 'Email or phone is required';
  end if;

  v_contact_no_space := regexp_replace(v_contact, '\\s+', '', 'g');

  select au.id
    into v_target_user_id
  from auth.users au
  left join public.profiles p
    on p.id = au.id
  where lower(coalesce(au.email, '')) = lower(v_contact)
     or regexp_replace(coalesce(au.phone, ''), '\\s+', '', 'g') = v_contact_no_space
     or regexp_replace(coalesce(p.phone, ''), '\\s+', '', 'g') = v_contact_no_space
  limit 1;

  if v_target_user_id is null then
    raise exception 'User not registered. Ask the user to sign up first, then grant access.';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    can_delete_entries,
    can_manage_categories,
    can_manage_users,
    dashboard_scope,
    invited_by
  )
  values (
    _workspace_id,
    v_target_user_id,
    _role,
    case when _role = 'admin' then true else _can_delete_entries end,
    case when _role = 'admin' then true else false end,
    case when _role = 'admin' then true else false end,
    case when _role = 'admin' then 'full'::public.dashboard_scope else 'shift'::public.dashboard_scope end,
    auth.uid()
  )
  on conflict (workspace_id, user_id)
  do update set
    role = excluded.role,
    can_delete_entries = excluded.can_delete_entries,
    can_manage_categories = excluded.can_manage_categories,
    can_manage_users = excluded.can_manage_users,
    dashboard_scope = excluded.dashboard_scope,
    invited_by = auth.uid(),
    updated_at = now();

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
    'workspace_member_granted',
    'workspace_member',
    v_target_user_id,
    jsonb_build_object(
      'contact', v_contact,
      'role', _role,
      'can_delete_entries', case when _role = 'admin' then true else _can_delete_entries end
    )
  );

  return v_target_user_id;
end;
$$;

grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.add_workspace_member_by_contact(uuid, text, public.app_role, boolean) to authenticated;
