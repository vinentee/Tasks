create or replace function public.create_folder(folder_name text)
returns public.workspace_folders
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text;
  target_workspace public.workspaces%rowtype;
  created_folder public.workspace_folders%rowtype;
  next_position integer;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado';
  end if;

  normalized_name := nullif(trim(folder_name), '');
  if normalized_name is null then
    raise exception 'Informe o nome da pasta';
  end if;

  select *
  into target_workspace
  from public.workspaces
  where owner_id = auth.uid()
  order by created_at asc
  limit 1;

  if target_workspace.id is null then
    insert into public.workspaces (name, owner_id)
    values ('Meus Planos', auth.uid())
    returning * into target_workspace;
  end if;

  select coalesce(max(position), 0) + 1
  into next_position
  from public.workspace_folders
  where workspace_id = target_workspace.id;

  insert into public.workspace_folders (workspace_id, name, position)
  values (target_workspace.id, normalized_name, next_position)
  returning * into created_folder;

  insert into public.folder_members (folder_id, user_id, role)
  values (created_folder.id, auth.uid(), 'owner')
  on conflict (folder_id, user_id) do update set role = 'owner';

  insert into public.folder_checklists (folder_id, title, position)
  values (created_folder.id, 'Checklist', 1)
  on conflict (folder_id, title) do nothing;

  return created_folder;
end;
$$;

revoke all on function public.create_folder(text) from public;
grant execute on function public.create_folder(text) to authenticated;
