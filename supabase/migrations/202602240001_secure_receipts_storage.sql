begin;

-- Receipts should not be public. Access is controlled by workspace membership.
update storage.buckets
set public = false
where id = 'receipts';

drop policy if exists "receipts_select_public" on storage.objects;
drop policy if exists "receipts_insert_authenticated" on storage.objects;
drop policy if exists "receipts_update_authenticated" on storage.objects;

create or replace function public.try_parse_uuid(_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return _value::uuid;
exception
  when others then
    return null;
end;
$$;

create policy receipts_select_workspace_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and public.is_workspace_member(public.try_parse_uuid(split_part(name, '/', 1)))
);

create policy receipts_insert_workspace_member_owner_path
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and split_part(name, '/', 2) = auth.uid()::text
  and public.is_workspace_member(public.try_parse_uuid(split_part(name, '/', 1)))
);

create policy receipts_update_owner_path
on storage.objects
for update
to authenticated
using (
  bucket_id = 'receipts'
  and split_part(name, '/', 2) = auth.uid()::text
)
with check (
  bucket_id = 'receipts'
  and split_part(name, '/', 2) = auth.uid()::text
  and public.is_workspace_member(public.try_parse_uuid(split_part(name, '/', 1)))
);

create policy receipts_delete_owner_path
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and split_part(name, '/', 2) = auth.uid()::text
);

commit;
