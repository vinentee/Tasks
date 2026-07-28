create extension if not exists pgcrypto;

create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('todo', 'doing', 'done');
create type public.workspace_role as enum ('owner', 'member');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'todo',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shared_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shared_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  notification_id text,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    updated_at = now();
  return new;
end;
$$;

create or replace function public.add_workspace_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  );
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger workspace_invitations_updated_at
before update on public.workspace_invitations
for each row execute function public.set_updated_at();

create trigger tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger task_checklist_items_updated_at
before update on public.task_checklist_items
for each row execute function public.set_updated_at();

create trigger shared_notes_updated_at
before update on public.shared_notes
for each row execute function public.set_updated_at();

create trigger shared_lists_updated_at
before update on public.shared_lists
for each row execute function public.set_updated_at();

create trigger shared_list_items_updated_at
before update on public.shared_list_items
for each row execute function public.set_updated_at();

create trigger reminders_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger on_workspace_created
after insert on public.workspaces
for each row execute function public.add_workspace_owner_member();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.shared_notes enable row level security;
alter table public.shared_lists enable row level security;
alter table public.shared_list_items enable row level security;
alter table public.reminders enable row level security;

create policy "profiles_select_own" on public.profiles
for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "workspaces_select_members" on public.workspaces
for select using (public.is_workspace_member(id));

create policy "workspaces_insert_owner" on public.workspaces
for insert with check (owner_id = auth.uid());

create policy "workspaces_update_owner" on public.workspaces
for update using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));

create policy "workspaces_delete_owner" on public.workspaces
for delete using (public.is_workspace_owner(id));

create policy "workspace_members_select_members" on public.workspace_members
for select using (public.is_workspace_member(workspace_id));

create policy "workspace_members_insert_owner" on public.workspace_members
for insert with check (public.is_workspace_owner(workspace_id));

create policy "workspace_members_delete_owner_or_self" on public.workspace_members
for delete using (public.is_workspace_owner(workspace_id) or user_id = auth.uid());

create policy "workspace_invitations_select_related" on public.workspace_invitations
for select using (
  public.is_workspace_owner(workspace_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "workspace_invitations_insert_owner" on public.workspace_invitations
for insert with check (public.is_workspace_owner(workspace_id) and invited_by = auth.uid());

create policy "workspace_invitations_update_owner_or_invited" on public.workspace_invitations
for update using (
  public.is_workspace_owner(workspace_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
) with check (
  public.is_workspace_owner(workspace_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "tasks_owner_all" on public.tasks
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "task_checklist_owner_all" on public.task_checklist_items
for all using (
  exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
) with check (
  exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
);

create policy "shared_notes_member_all" on public.shared_notes
for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "shared_lists_member_all" on public.shared_lists
for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "shared_list_items_member_all" on public.shared_list_items
for all using (
  exists (
    select 1
    from public.shared_lists sl
    where sl.id = list_id
      and public.is_workspace_member(sl.workspace_id)
  )
) with check (
  exists (
    select 1
    from public.shared_lists sl
    where sl.id = list_id
      and public.is_workspace_member(sl.workspace_id)
  )
);

create policy "reminders_owner_or_workspace_member_all" on public.reminders
for all using (
  owner_id = auth.uid()
  or (workspace_id is not null and public.is_workspace_member(workspace_id))
) with check (
  owner_id = auth.uid()
  and (workspace_id is null or public.is_workspace_member(workspace_id))
);

alter table public.tasks replica identity full;
alter table public.task_checklist_items replica identity full;
alter table public.workspaces replica identity full;
alter table public.workspace_invitations replica identity full;
alter table public.shared_notes replica identity full;
alter table public.shared_lists replica identity full;
alter table public.shared_list_items replica identity full;
alter table public.reminders replica identity full;

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_checklist_items;
alter publication supabase_realtime add table public.workspaces;
alter publication supabase_realtime add table public.workspace_invitations;
alter publication supabase_realtime add table public.shared_notes;
alter publication supabase_realtime add table public.shared_lists;
alter publication supabase_realtime add table public.shared_list_items;
alter publication supabase_realtime add table public.reminders;
