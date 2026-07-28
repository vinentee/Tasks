alter table public.workspace_invitations
add column if not exists folder_id uuid references public.workspace_folders (id) on delete set null;

drop function if exists public.list_received_workspace_invitations();

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

  insert into public.workspace_invitations (workspace_id, folder_id, email, role, status, invited_by)
  values (target_workspace_id, target_folder_id, normalized_email, 'member', 'pending', auth.uid())
  on conflict (workspace_id, email) do update set
    folder_id = excluded.folder_id,
    role = 'member',
    status = 'pending',
    invited_by = auth.uid(),
    updated_at = now()
  returning *
  into next_invitation;

  return next_invitation;
end;
$$;

create or replace function public.list_received_workspace_invitations()
returns table (
  id uuid,
  workspace_id uuid,
  folder_id uuid,
  folder_name text,
  workspace_name text,
  email text,
  role public.workspace_role,
  status public.invitation_status,
  invited_by uuid,
  invited_by_name text,
  invited_by_email text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wi.id,
    wi.workspace_id,
    wi.folder_id,
    wf.name as folder_name,
    w.name as workspace_name,
    wi.email,
    wi.role,
    wi.status,
    wi.invited_by,
    inviter.full_name as invited_by_name,
    inviter.email as invited_by_email,
    wi.created_at
  from public.workspace_invitations wi
  join public.workspaces w on w.id = wi.workspace_id
  left join public.workspace_folders wf on wf.id = wi.folder_id
  left join public.profiles inviter on inviter.id = wi.invited_by
  where wi.status = 'pending'
    and lower(wi.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by wi.created_at desc;
$$;

grant execute on function public.create_workspace_invitation(uuid, text, uuid) to authenticated;
grant execute on function public.list_received_workspace_invitations() to authenticated;
