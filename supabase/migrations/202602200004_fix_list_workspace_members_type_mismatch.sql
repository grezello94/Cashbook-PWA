begin;

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
    wm.workspace_id::uuid,
    wm.user_id::uuid,
    wm.role::public.app_role,
    coalesce(wm.can_delete_entries, false)::boolean,
    coalesce(wm.can_manage_categories, false)::boolean,
    coalesce(wm.can_manage_users, false)::boolean,
    wm.dashboard_scope::public.dashboard_scope,
    coalesce(wm.access_disabled, false)::boolean,
    p.full_name::text,
    au.email::text,
    coalesce(p.phone, nullif(au.phone, ''))::text
  from public.workspace_members wm
  left join public.profiles p
    on p.id = wm.user_id
  left join auth.users au
    on au.id = wm.user_id
  where wm.workspace_id = _workspace_id
  order by
    case when wm.role = 'admin' then 0 else 1 end,
    coalesce(wm.access_disabled, false),
    coalesce(p.full_name, au.email, wm.user_id::text);
end;
$$;

grant execute on function public.list_workspace_members(uuid) to authenticated;

commit;
