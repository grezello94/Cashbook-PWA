begin;

-- Lock legacy direct member grant RPC for all client-facing roles.
do $$
begin
  if to_regprocedure('public.add_workspace_member_by_contact(uuid,text,public.app_role,boolean)') is not null then
    execute 'revoke execute on function public.add_workspace_member_by_contact(uuid, text, public.app_role, boolean) from public';
    execute 'revoke execute on function public.add_workspace_member_by_contact(uuid, text, public.app_role, boolean) from anon';
    execute 'revoke execute on function public.add_workspace_member_by_contact(uuid, text, public.app_role, boolean) from authenticated';
  end if;
end
$$;

commit;
