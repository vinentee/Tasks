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

  if lower(target_invitation.email) <> current_email then
    raise exception 'Este convite pertence a outro email';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_invitation.workspace_id, auth.uid(), target_invitation.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  update public.workspace_invitations
  set status = 'accepted'
  where id = target_invitation.id;
end;
$$;
