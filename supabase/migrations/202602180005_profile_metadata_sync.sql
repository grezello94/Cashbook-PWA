create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id)
  do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

update public.profiles p
set
  full_name = coalesce(nullif(p.full_name, ''), nullif(au.raw_user_meta_data->>'full_name', '')),
  phone = coalesce(p.phone, nullif(au.raw_user_meta_data->>'phone', '')),
  updated_at = now()
from auth.users au
where au.id = p.id;
