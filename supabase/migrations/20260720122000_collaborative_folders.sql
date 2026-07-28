create table if not exists public.workspace_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.folder_checklists (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.workspace_folders (id) on delete cascade,
  title text not null,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (folder_id, title)
);

create table if not exists public.folder_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.folder_checklists (id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 1,
  assigned_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checklist_id, title)
);

create table if not exists public.folder_sections (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.workspace_folders (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image', 'map', 'budget')),
  title text not null,
  body text,
  media_url text,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (folder_id, title)
);

create table if not exists public.folder_files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.workspace_folders (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.folder_comments (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.workspace_folders (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

drop trigger if exists workspace_folders_updated_at on public.workspace_folders;
create trigger workspace_folders_updated_at
before update on public.workspace_folders
for each row execute function public.set_updated_at();

drop trigger if exists folder_checklists_updated_at on public.folder_checklists;
create trigger folder_checklists_updated_at
before update on public.folder_checklists
for each row execute function public.set_updated_at();

drop trigger if exists folder_checklist_items_updated_at on public.folder_checklist_items;
create trigger folder_checklist_items_updated_at
before update on public.folder_checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists folder_sections_updated_at on public.folder_sections;
create trigger folder_sections_updated_at
before update on public.folder_sections
for each row execute function public.set_updated_at();

alter table public.workspace_folders enable row level security;
alter table public.folder_checklists enable row level security;
alter table public.folder_checklist_items enable row level security;
alter table public.folder_sections enable row level security;
alter table public.folder_files enable row level security;
alter table public.folder_comments enable row level security;

create or replace function public.folder_workspace_id(target_folder_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select wf.workspace_id
  from public.workspace_folders wf
  where wf.id = target_folder_id;
$$;

create or replace function public.checklist_workspace_id(target_checklist_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select wf.workspace_id
  from public.folder_checklists fc
  join public.workspace_folders wf on wf.id = fc.folder_id
  where fc.id = target_checklist_id;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspace_folders' and policyname = 'workspace_folders_member_all') then
    create policy "workspace_folders_member_all" on public.workspace_folders
    for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'folder_checklists' and policyname = 'folder_checklists_member_all') then
    create policy "folder_checklists_member_all" on public.folder_checklists
    for all using (public.is_workspace_member(public.folder_workspace_id(folder_id))) with check (public.is_workspace_member(public.folder_workspace_id(folder_id)));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'folder_checklist_items' and policyname = 'folder_checklist_items_member_all') then
    create policy "folder_checklist_items_member_all" on public.folder_checklist_items
    for all using (public.is_workspace_member(public.checklist_workspace_id(checklist_id))) with check (public.is_workspace_member(public.checklist_workspace_id(checklist_id)));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'folder_sections' and policyname = 'folder_sections_member_all') then
    create policy "folder_sections_member_all" on public.folder_sections
    for all using (public.is_workspace_member(public.folder_workspace_id(folder_id))) with check (public.is_workspace_member(public.folder_workspace_id(folder_id)));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'folder_files' and policyname = 'folder_files_member_all') then
    create policy "folder_files_member_all" on public.folder_files
    for all using (public.is_workspace_member(public.folder_workspace_id(folder_id))) with check (uploaded_by = auth.uid() and public.is_workspace_member(public.folder_workspace_id(folder_id)));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'folder_comments' and policyname = 'folder_comments_member_all') then
    create policy "folder_comments_member_all" on public.folder_comments
    for all using (public.is_workspace_member(public.folder_workspace_id(folder_id))) with check (author_id = auth.uid() and public.is_workspace_member(public.folder_workspace_id(folder_id)));
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('workspace-files', 'workspace-files', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'workspace_files_authenticated_read') then
    create policy "workspace_files_authenticated_read" on storage.objects
    for select using (
      bucket_id = 'workspace-files'
      and auth.role() = 'authenticated'
      and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'workspace_files_authenticated_insert') then
    create policy "workspace_files_authenticated_insert" on storage.objects
    for insert with check (
      bucket_id = 'workspace-files'
      and auth.role() = 'authenticated'
      and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    );
  end if;
end;
$$;

alter table public.workspace_folders replica identity full;
alter table public.folder_checklists replica identity full;
alter table public.folder_checklist_items replica identity full;
alter table public.folder_sections replica identity full;
alter table public.folder_files replica identity full;
alter table public.folder_comments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.workspace_folders;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.folder_checklists;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.folder_checklist_items;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.folder_sections;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.folder_files;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.folder_comments;
exception when duplicate_object then null;
end;
$$;
