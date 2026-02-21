begin;

-- Only RPC functions should mutate workspace_access_requests status.
-- Remove broad update policy that allowed requester/target to update rows directly.
do $$
begin
  if to_regclass('public.workspace_access_requests') is not null then
    execute 'drop policy if exists workspace_access_requests_update_target on public.workspace_access_requests';
  end if;
end
$$;

-- Explicit deny-by-default for row updates from client roles.
-- (RLS with no update policy blocks update/patch operations.)

commit;
