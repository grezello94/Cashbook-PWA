begin;

create or replace function public.list_workspace_access_requests_sent(
  _workspace_id uuid
)
returns table (
  id uuid,
  workspace_id uuid,
  target_user_id uuid,
  target_name text,
  target_email text,
  target_phone text,
  requested_by uuid,
  role public.app_role,
  can_delete_entries boolean,
  can_manage_categories boolean,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  note text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_workspace_admin(_workspace_id) then
    raise exception 'Only workspace admin can view sent requests';
  end if;

  return query
  select
    war.id,
    war.workspace_id,
    war.target_user_id,
    p.full_name as target_name,
    au.email as target_email,
    coalesce(p.phone, au.phone) as target_phone,
    war.requested_by,
    war.role,
    war.can_delete_entries,
    war.can_manage_categories,
    war.status,
    war.requested_at,
    war.reviewed_at,
    war.note
  from public.workspace_access_requests war
  left join public.profiles p
    on p.id = war.target_user_id
  left join auth.users au
    on au.id = war.target_user_id
  where war.workspace_id = _workspace_id
  order by war.requested_at desc;
end;
$$;

grant execute on function public.list_workspace_access_requests_sent(uuid) to authenticated;

commit;
