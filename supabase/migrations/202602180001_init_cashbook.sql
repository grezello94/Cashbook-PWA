begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'editor');
create type public.dashboard_scope as enum ('full', 'shift');
create type public.category_type as enum ('income', 'expense');
create type public.cash_direction as enum ('cash_in', 'cash_out');
create type public.delete_request_status as enum ('pending', 'approved', 'rejected');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,
  timezone text not null default 'UTC',
  currency char(3) not null default 'USD',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_currency_chk check (currency ~ '^[A-Z]{3}$')
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'editor',
  can_delete_entries boolean not null default false,
  can_manage_categories boolean not null default false,
  can_manage_users boolean not null default false,
  dashboard_scope public.dashboard_scope not null default 'shift',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  name_key text generated always as (lower(btrim(name))) stored,
  type public.category_type not null,
  icon text,
  color text,
  source text not null default 'manual',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_source_chk check (source in ('system', 'ai_generated', 'manual')),
  unique (workspace_id, id),
  unique (workspace_id, type, name_key)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction public.cash_direction not null,
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid not null,
  remarks text,
  receipt_url text,
  entry_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  status text not null default 'active',
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_status_chk check (status in ('active', 'deleted')),
  constraint entries_deleted_state_chk check (
    (status = 'active' and deleted_at is null and deleted_by is null)
    or
    (status = 'deleted' and deleted_at is not null and deleted_by is not null)
  ),
  constraint entries_category_fk
    foreign key (workspace_id, category_id)
    references public.categories(workspace_id, id)
    on delete restrict
);

create table public.delete_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entry_id uuid not null,
  requested_by uuid not null references auth.users(id),
  reason text not null,
  status public.delete_request_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delete_requests_entry_fk
    foreign key (workspace_id, entry_id)
    references public.entries(workspace_id, id)
    on delete cascade,
  constraint delete_requests_review_state_chk check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workspace_members_user_idx on public.workspace_members(user_id);
create index categories_workspace_idx on public.categories(workspace_id, type, is_active);
create index entries_workspace_entry_at_idx on public.entries(workspace_id, entry_at desc);
create index entries_workspace_status_idx on public.entries(workspace_id, status);
create unique index delete_requests_one_pending_per_entry_idx on public.delete_requests(entry_id) where status = 'pending';
create index delete_requests_workspace_status_idx on public.delete_requests(workspace_id, status, created_at desc);
create index audit_logs_workspace_created_idx on public.audit_logs(workspace_id, created_at desc);

create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger trg_workspace_members_updated_at before update on public.workspace_members for each row execute function public.set_updated_at();
create trigger trg_categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger trg_entries_updated_at before update on public.entries for each row execute function public.set_updated_at();
create trigger trg_delete_requests_updated_at before update on public.delete_requests for each row execute function public.set_updated_at();

create or replace function public.normalize_member_permissions()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin' then
    new.can_delete_entries := true;
    new.can_manage_categories := true;
    new.can_manage_users := true;
    new.dashboard_scope := 'full';
  end if;
  return new;
end;
$$;

create trigger trg_workspace_members_normalize
before insert or update on public.workspace_members
for each row execute function public.normalize_member_permissions();

create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin'
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  ), false);
$$;

create or replace function public.can_manage_users(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin' or wm.can_manage_users
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  ), false);
$$;

create or replace function public.can_manage_categories(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin' or wm.can_manage_categories
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  ), false);
$$;

create or replace function public.can_delete_entries(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select wm.role = 'admin' or wm.can_delete_entries
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  ), false);
$$;

create or replace function public.enforce_entry_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_type public.category_type;
begin
  if tg_op = 'UPDATE' then
    if old.id <> new.id or old.workspace_id <> new.workspace_id then
      raise exception 'id/workspace_id cannot be changed';
    end if;

    if old.created_by <> new.created_by then
      raise exception 'created_by cannot be changed';
    end if;

    if old.status = 'deleted' then
      raise exception 'Deleted entries are immutable';
    end if;

    if new.status = 'deleted' and old.status <> 'deleted' and not public.can_delete_entries(old.workspace_id) then
      raise exception 'No permission to delete this entry';
    end if;
  end if;

  select c.type
    into v_category_type
  from public.categories c
  where c.workspace_id = new.workspace_id
    and c.id = new.category_id
    and c.is_active = true;

  if not found then
    raise exception 'Category is invalid or inactive';
  end if;

  if new.direction = 'cash_out' and v_category_type <> 'expense' then
    raise exception 'cash_out requires an expense category';
  end if;

  if new.direction = 'cash_in' and v_category_type <> 'income' then
    raise exception 'cash_in requires an income category';
  end if;

  if new.status = 'active' then
    new.deleted_at := null;
    new.deleted_by := null;
  elsif new.status = 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
    new.deleted_by := coalesce(new.deleted_by, auth.uid());
  end if;

  return new;
end;
$$;

create trigger trg_entries_enforce_rules
before insert or update on public.entries
for each row execute function public.enforce_entry_rules();

create or replace function public.handle_delete_request_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'Delete request already finalized';
  end if;

  if new.status = 'pending' then
    raise exception 'status must move to approved or rejected';
  end if;

  new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  new.reviewed_at := coalesce(new.reviewed_at, now());

  if new.status = 'approved' then
    update public.entries e
       set status = 'deleted',
           deleted_at = coalesce(e.deleted_at, now()),
           deleted_by = new.reviewed_by,
           updated_at = now()
     where e.workspace_id = new.workspace_id
       and e.id = new.entry_id
       and e.status = 'active';
  end if;

  insert into public.audit_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, meta
  )
  values (
    new.workspace_id,
    new.reviewed_by,
    case when new.status = 'approved' then 'delete_request_approved' else 'delete_request_rejected' end,
    'delete_request',
    new.id,
    jsonb_build_object(
      'entry_id', new.entry_id,
      'requested_by', new.requested_by,
      'reason', new.reason,
      'review_note', new.review_note
    )
  );

  return new;
end;
$$;

create trigger trg_delete_requests_review
before update on public.delete_requests
for each row execute function public.handle_delete_request_review();

create or replace function public.create_workspace_with_owner(
  _name text,
  _industry text,
  _timezone text default 'UTC',
  _currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.workspaces (name, industry, timezone, currency, created_by)
  values (_name, _industry, coalesce(_timezone, 'UTC'), upper(coalesce(_currency, 'USD')), v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v_workspace_id, v_user_id, 'admin', v_user_id);

  insert into public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id)
  values (v_workspace_id, v_user_id, 'workspace_created', 'workspace', v_workspace_id);

  return v_workspace_id;
end;
$$;

grant execute on function public.create_workspace_with_owner(text, text, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.categories enable row level security;
alter table public.entries enable row level security;
alter table public.delete_requests enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_select_member on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_update_admin on public.workspaces for update to authenticated using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));
create policy workspaces_delete_admin on public.workspaces for delete to authenticated using (public.is_workspace_admin(id));

create policy workspace_members_select_member on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy workspace_members_insert_admin on public.workspace_members for insert to authenticated with check (public.can_manage_users(workspace_id));
create policy workspace_members_update_admin on public.workspace_members for update to authenticated using (public.can_manage_users(workspace_id)) with check (public.can_manage_users(workspace_id));
create policy workspace_members_delete_admin on public.workspace_members for delete to authenticated using (public.can_manage_users(workspace_id) and user_id <> auth.uid());

create policy categories_select_member on public.categories for select to authenticated using (public.is_workspace_member(workspace_id));
create policy categories_insert_admin on public.categories for insert to authenticated with check (public.can_manage_categories(workspace_id) and created_by = auth.uid());
create policy categories_update_admin on public.categories for update to authenticated using (public.can_manage_categories(workspace_id)) with check (public.can_manage_categories(workspace_id));
create policy categories_delete_admin on public.categories for delete to authenticated using (public.can_manage_categories(workspace_id));

create policy entries_select_member on public.entries for select to authenticated using (public.is_workspace_member(workspace_id));
create policy entries_insert_member on public.entries for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy entries_update_member on public.entries for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy delete_requests_select_member on public.delete_requests for select to authenticated using (public.is_workspace_member(workspace_id));
create policy delete_requests_insert_member on public.delete_requests for insert to authenticated with check (public.is_workspace_member(workspace_id) and requested_by = auth.uid() and status = 'pending');
create policy delete_requests_update_admin on public.delete_requests for update to authenticated using (public.can_delete_entries(workspace_id)) with check (public.can_delete_entries(workspace_id) and status in ('approved', 'rejected'));

create policy audit_logs_select_admin on public.audit_logs for select to authenticated using (public.is_workspace_admin(workspace_id));

commit;
