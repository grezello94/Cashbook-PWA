begin;

create or replace function public.cancel_workspace_access_request(
  _request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.workspace_access_requests%rowtype;
  v_member public.workspace_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_request
  from public.workspace_access_requests war
  where war.id = _request_id
    and war.status = 'pending'
  limit 1;

  if not found then
    raise exception 'Pending request not found';
  end if;

  select *
    into v_member
  from public.workspace_members wm
  where wm.workspace_id = v_request.workspace_id
    and wm.user_id = auth.uid()
  limit 1;

  if not found or not (v_member.role = 'admin' or v_member.can_manage_users) then
    raise exception 'Only workspace admins can cancel access requests';
  end if;

  update public.workspace_access_requests
     set status = 'cancelled',
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         note = 'Cancelled by admin'
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
    'workspace_access_cancelled',
    'workspace_access_request',
    v_request.id,
    jsonb_build_object(
      'requested_by', v_request.requested_by,
      'target_user_id', v_request.target_user_id
    )
  );

  return v_request.workspace_id;
end;
$$;

grant execute on function public.cancel_workspace_access_request(uuid) to authenticated;

commit;
