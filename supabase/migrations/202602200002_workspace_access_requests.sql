begin;

create table if not exists public.workspace_access_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  role public.app_role not null default 'editor',
  can_delete_entries boolean not null default false,
  can_manage_categories boolean not null default false,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  note text,
  constraint workspace_access_requests_status_chk
    check (status in ('pending', 'accepted', 'rejected', 'cancelled'))
);

create unique index if not exists workspace_access_requests_one_pending_idx
  on public.workspace_access_requests(workspace_id, target_user_id)
  where status = 'pending';

alter table public.workspace_access_requests enable row level security;

create policy workspace_access_requests_select_participants
on public.workspace_access_requests
for select
to authenticated
using (
  target_user_id = auth.uid()
  or (requested_by = auth.uid() and public.is_workspace_member(workspace_id))
);

create policy workspace_access_requests_insert_admin
on public.workspace_access_requests
for insert
to authenticated
with check (
  requested_by = auth.uid()
  and public.is_workspace_admin(workspace_id)
);

create policy workspace_access_requests_update_target
on public.workspace_access_requests
for update
to authenticated
using (target_user_id = auth.uid() or requested_by = auth.uid())
with check (target_user_id = auth.uid() or requested_by = auth.uid());

create or replace function public.request_workspace_access_by_contact(
  _workspace_id uuid,
  _contact text,
  _role public.app_role default 'editor',
  _can_delete_entries boolean default false,
  _can_manage_categories boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact text := btrim(_contact);
  v_contact_no_space text;
  v_target_user_id uuid;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_workspace_admin(_workspace_id) then
    raise exception 'Only admin can request new user access';
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
    raise exception 'User not registered. Ask the user to sign up first, then send access request.';
  end if;

  if v_target_user_id = auth.uid() then
    raise exception 'You are already part of this workspace';
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = v_target_user_id
  ) then
    raise exception 'User already has workspace access';
  end if;

  update public.workspace_access_requests
     set status = 'cancelled',
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         note = 'Superseded by new request'
   where workspace_id = _workspace_id
     and target_user_id = v_target_user_id
     and status = 'pending';

  insert into public.workspace_access_requests (
    workspace_id,
    target_user_id,
    requested_by,
    role,
    can_delete_entries,
    can_manage_categories,
    status
  )
  values (
    _workspace_id,
    v_target_user_id,
    auth.uid(),
    _role,
    case when _role = 'admin' then true else _can_delete_entries end,
    case when _role = 'admin' then true else _can_manage_categories end,
    'pending'
  )
  returning id into v_request_id;

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
    'workspace_access_requested',
    'workspace_access_request',
    v_request_id,
    jsonb_build_object(
      'target_user_id', v_target_user_id,
      'contact', v_contact,
      'role', _role
    )
  );

  return v_request_id;
end;
$$;

create or replace function public.list_my_workspace_access_requests()
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_industry text,
  workspace_currency char(3),
  workspace_timezone text,
  requested_by uuid,
  requested_by_name text,
  requested_by_email text,
  role public.app_role,
  can_delete_entries boolean,
  can_manage_categories boolean,
  status text,
  requested_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    war.id,
    war.workspace_id,
    w.name as workspace_name,
    w.industry as workspace_industry,
    w.currency as workspace_currency,
    w.timezone as workspace_timezone,
    war.requested_by,
    p.full_name as requested_by_name,
    au.email as requested_by_email,
    war.role,
    war.can_delete_entries,
    war.can_manage_categories,
    war.status,
    war.requested_at
  from public.workspace_access_requests war
  join public.workspaces w
    on w.id = war.workspace_id
  left join public.profiles p
    on p.id = war.requested_by
  left join auth.users au
    on au.id = war.requested_by
  where war.target_user_id = auth.uid()
    and war.status = 'pending'
  order by war.requested_at desc;
$$;

create or replace function public.respond_workspace_access_request(
  _request_id uuid,
  _decision text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.workspace_access_requests%rowtype;
  v_decision text := lower(btrim(coalesce(_decision, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_decision not in ('accept', 'reject') then
    raise exception 'Decision must be accept or reject';
  end if;

  select *
    into v_request
  from public.workspace_access_requests war
  where war.id = _request_id
    and war.target_user_id = auth.uid()
    and war.status = 'pending'
  limit 1;

  if not found then
    raise exception 'Request not found or already handled';
  end if;

  if v_decision = 'accept' then
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
      v_request.workspace_id,
      v_request.target_user_id,
      v_request.role,
      case when v_request.role = 'admin' then true else v_request.can_delete_entries end,
      case when v_request.role = 'admin' then true else v_request.can_manage_categories end,
      case when v_request.role = 'admin' then true else false end,
      case when v_request.role = 'admin' then 'full'::public.dashboard_scope else 'shift'::public.dashboard_scope end,
      v_request.requested_by
    )
    on conflict (workspace_id, user_id)
    do update set
      role = excluded.role,
      can_delete_entries = excluded.can_delete_entries,
      can_manage_categories = excluded.can_manage_categories,
      can_manage_users = excluded.can_manage_users,
      dashboard_scope = excluded.dashboard_scope,
      invited_by = excluded.invited_by,
      updated_at = now();

    update public.workspace_access_requests
       set status = 'accepted',
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = v_request.id;

    insert into public.audit_logs (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      meta
    )
    values (
      v_request.workspace_id,
      auth.uid(),
      'workspace_access_accepted',
      'workspace_access_request',
      v_request.id,
      jsonb_build_object(
        'requested_by', v_request.requested_by,
        'target_user_id', v_request.target_user_id,
        'role', v_request.role
      )
    );
  else
    update public.workspace_access_requests
       set status = 'rejected',
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = v_request.id;

    insert into public.audit_logs (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      meta
    )
    values (
      v_request.workspace_id,
      auth.uid(),
      'workspace_access_rejected',
      'workspace_access_request',
      v_request.id,
      jsonb_build_object(
        'requested_by', v_request.requested_by,
        'target_user_id', v_request.target_user_id
      )
    );
  end if;

  return v_request.workspace_id;
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
  v_admin_count integer;
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

  select wm.role
    into v_target_role
  from public.workspace_members wm
  where wm.workspace_id = _workspace_id
    and wm.user_id = _target_user_id;

  if v_target_role is null then
    raise exception 'User is not part of this workspace';
  end if;

  if v_target_role = 'admin' then
    select count(*)
      into v_admin_count
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last admin from workspace';
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

grant execute on function public.request_workspace_access_by_contact(uuid, text, public.app_role, boolean, boolean) to authenticated;
grant execute on function public.list_my_workspace_access_requests() to authenticated;
grant execute on function public.respond_workspace_access_request(uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

commit;
