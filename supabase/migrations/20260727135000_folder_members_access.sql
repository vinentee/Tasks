create table if not exists public.folder_members (
  folder_id uuid not null references public.workspace_folders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (folder_id, user_id)
);

insert into public.folder_members (folder_id, user_id, role)
select wf.id, w.owner_id, 'owner'
from public.workspace_folders wf
join public.workspaces w on w.id = wf.workspace_id
on conflict (folder_id, user_id) do update set role = 'owner';

create or replace function public.is_folder_member(target_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.folder_members fm
    where fm.folder_id = target_folder_id
      and fm.user_id = auth.uid()
  );
$$;

create or replace function public.is_folder_owner(target_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.folder_members fm
    where fm.folder_id = target_folder_id
      and fm.user_id = auth.uid()
      and fm.role = 'owner'
  );
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.folder_members viewer
      join public.folder_members target on target.folder_id = viewer.folder_id
      where viewer.user_id = auth.uid()
        and target.user_id = target_user_id
    )
    or exists (
      select 1
      from public.workspace_members viewer
      join public.workspace_members target on target.workspace_id = viewer.workspace_id
      where viewer.user_id = auth.uid()
        and target.user_id = target_user_id
    );
$$;

create or replace function public.checklist_folder_id(target_checklist_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fc.folder_id
  from public.folder_checklists fc
  where fc.id = target_checklist_id;
$$;

create or replace function public.add_folder_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.folder_members (folder_id, user_id, role)
  values (new.id, auth.uid(), 'owner')
  on conflict (folder_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists folder_owner_member on public.workspace_folders;
create trigger folder_owner_member
after insert on public.workspace_folders
for each row execute function public.add_folder_owner_member();

drop policy if exists "workspace_folders_member_all" on public.workspace_folders;
drop policy if exists "folder_checklists_member_all" on public.folder_checklists;
drop policy if exists "folder_checklist_items_member_all" on public.folder_checklist_items;
drop policy if exists "folder_sections_member_all" on public.folder_sections;
drop policy if exists "folder_files_member_all" on public.folder_files;
drop policy if exists "folder_comments_member_all" on public.folder_comments;
drop policy if exists "workspace_folders_folder_member_all" on public.workspace_folders;
drop policy if exists "folder_checklists_folder_member_all" on public.folder_checklists;
drop policy if exists "folder_checklist_items_folder_member_all" on public.folder_checklist_items;
drop policy if exists "folder_sections_folder_member_all" on public.folder_sections;
drop policy if exists "folder_files_folder_member_all" on public.folder_files;
drop policy if exists "folder_comments_folder_member_all" on public.folder_comments;

create policy "workspace_folders_folder_member_all" on public.workspace_folders
for all
using (public.is_folder_member(id) or public.is_workspace_owner(workspace_id))
with check (public.is_folder_member(id) or public.is_workspace_owner(workspace_id));

create policy "folder_checklists_folder_member_all" on public.folder_checklists
for all
using (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)))
with check (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)));

create policy "folder_checklist_items_folder_member_all" on public.folder_checklist_items
for all
using (
  public.is_folder_member(public.checklist_folder_id(checklist_id))
  or public.is_workspace_owner(public.checklist_workspace_id(checklist_id))
)
with check (
  public.is_folder_member(public.checklist_folder_id(checklist_id))
  or public.is_workspace_owner(public.checklist_workspace_id(checklist_id))
);

create policy "folder_sections_folder_member_all" on public.folder_sections
for all
using (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)))
with check (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)));

create policy "folder_files_folder_member_all" on public.folder_files
for all
using (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)))
with check (
  uploaded_by = auth.uid()
  and (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)))
);

create policy "folder_comments_folder_member_all" on public.folder_comments
for all
using (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)))
with check (
  author_id = auth.uid()
  and (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)))
);

alter table public.folder_members enable row level security;

drop policy if exists "folder_members_select_folder_members" on public.folder_members;
drop policy if exists "folder_members_insert_folder_owner" on public.folder_members;
drop policy if exists "folder_members_delete_folder_owner_or_self" on public.folder_members;

create policy "folder_members_select_folder_members" on public.folder_members
for select using (public.is_folder_member(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)));

create policy "folder_members_insert_folder_owner" on public.folder_members
for insert with check (public.is_folder_owner(folder_id) or public.is_workspace_owner(public.folder_workspace_id(folder_id)));

create policy "folder_members_delete_folder_owner_or_self" on public.folder_members
for delete using (
  public.is_folder_owner(folder_id)
  or public.is_workspace_owner(public.folder_workspace_id(folder_id))
  or user_id = auth.uid()
);

drop policy if exists "profiles_select_shared_members" on public.profiles;

create policy "profiles_select_shared_members" on public.profiles
for select using (public.can_view_profile(id));

create or replace function public.accept_workspace_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invitation public.workspace_invitations%rowtype;
  current_email text;
begin
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select *
  into target_invitation
  from public.workspace_invitations
  where id = invitation_id
  for update;

  if not found then
    raise exception 'Convite nao encontrado';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception 'Convite nao esta pendente';
  end if;

  if target_invitation.folder_id is null then
    raise exception 'Convite antigo sem pasta. Peca para enviarem novamente.';
  end if;

  if lower(target_invitation.email) <> current_email then
    raise exception 'Este convite pertence a outro email';
  end if;

  insert into public.folder_members (folder_id, user_id, role)
  values (target_invitation.folder_id, auth.uid(), target_invitation.role)
  on conflict (folder_id, user_id) do update set role = excluded.role;

  update public.workspace_invitations
  set status = 'accepted'
  where id = target_invitation.id;
end;
$$;

create or replace function public.create_workspace_invitation(
  target_workspace_id uuid,
  invited_email text,
  target_folder_id uuid default null
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  target_profile public.profiles%rowtype;
  existing_invitation public.workspace_invitations%rowtype;
  next_invitation public.workspace_invitations%rowtype;
begin
  normalized_email := lower(trim(invited_email));

  if normalized_email = '' then
    raise exception 'Informe um email';
  end if;

  if target_folder_id is null then
    raise exception 'Selecione uma pasta para convidar';
  end if;

  if not (
    public.is_folder_owner(target_folder_id)
    or public.is_workspace_owner(target_workspace_id)
  ) then
    raise exception 'Voce nao pode convidar membros para esta pasta';
  end if;

  if not exists (
    select 1
    from public.workspace_folders wf
    where wf.id = target_folder_id
      and wf.workspace_id = target_workspace_id
  ) then
    raise exception 'Pasta nao pertence a este workspace';
  end if;

  select *
  into target_profile
  from public.profiles
  where lower(email) = normalized_email
  limit 1;

  if not found then
    raise exception 'Usuario nao encontrado';
  end if;

  if exists (
    select 1
    from public.folder_members fm
    where fm.folder_id = target_folder_id
      and fm.user_id = target_profile.id
  ) then
    raise exception 'Usuario ja faz parte desta pasta';
  end if;

  select *
  into existing_invitation
  from public.workspace_invitations
  where workspace_id = target_workspace_id
    and lower(email) = normalized_email
  limit 1
  for update;

  if found then
    update public.workspace_invitations
    set
      folder_id = target_folder_id,
      role = 'member',
      status = 'pending',
      invited_by = auth.uid(),
      updated_at = now()
    where id = existing_invitation.id
    returning *
    into next_invitation;
  else
    insert into public.workspace_invitations (workspace_id, folder_id, email, role, status, invited_by)
    values (target_workspace_id, target_folder_id, normalized_email, 'member', 'pending', auth.uid())
    returning *
    into next_invitation;
  end if;

  return next_invitation;
end;
$$;

alter table public.folder_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.folder_members;
exception when duplicate_object then null;
end;
$$;

drop policy if exists "workspace_files_authenticated_read" on storage.objects;
drop policy if exists "workspace_files_authenticated_insert" on storage.objects;
drop policy if exists "workspace_files_folder_member_read" on storage.objects;
drop policy if exists "workspace_files_folder_member_insert" on storage.objects;

create policy "workspace_files_folder_member_read" on storage.objects
for select using (
  bucket_id = 'workspace-files'
  and auth.role() = 'authenticated'
  and public.is_folder_member(((storage.foldername(name))[2])::uuid)
);

create policy "workspace_files_folder_member_insert" on storage.objects
for insert with check (
  bucket_id = 'workspace-files'
  and auth.role() = 'authenticated'
  and public.is_folder_member(((storage.foldername(name))[2])::uuid)
);
