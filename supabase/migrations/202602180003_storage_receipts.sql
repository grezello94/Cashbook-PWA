insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

create policy "receipts_select_public"
on storage.objects
for select
to public
using (bucket_id = 'receipts');

create policy "receipts_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'receipts');

create policy "receipts_update_authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'receipts')
with check (bucket_id = 'receipts');
