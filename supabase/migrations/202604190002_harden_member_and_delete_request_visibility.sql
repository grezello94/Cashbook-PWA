begin;

drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_own
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists delete_requests_select_member on public.delete_requests;
create policy delete_requests_select_requester_or_reviewer
on public.delete_requests
for select
to authenticated
using (
  requested_by = auth.uid()
  or public.can_delete_entries(workspace_id)
);

commit;
