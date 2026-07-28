drop function if exists public.create_workspace_invitation(uuid, text);

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

  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Voce nao pode convidar membros para este workspace';
  end if;

  if target_folder_id is not null and not exists (
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
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = target_profile.id
  ) then
    raise exception 'Usuario ja faz parte deste workspace';
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

grant execute on function public.create_workspace_invitation(uuid, text, uuid) to authenticated;
