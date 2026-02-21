begin;

-- Enforce invite-accept flow: direct client inserts to workspace_members are blocked.
drop policy if exists workspace_members_insert_admin on public.workspace_members;

-- Legacy direct grant RPC is intentionally disabled for authenticated clients.
do $$
begin
  if to_regprocedure('public.add_workspace_member_by_contact(uuid,text,public.app_role,boolean)') is not null then
    execute 'revoke execute on function public.add_workspace_member_by_contact(uuid, text, public.app_role, boolean) from authenticated';
  end if;
end
$$;

commit;
