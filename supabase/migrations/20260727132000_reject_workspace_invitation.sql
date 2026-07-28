create or replace function public.reject_workspace_invitation(invitation_id uuid)
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

  update public.workspace_invitations
  set status = 'revoked'
  where id = target_invitation.id;
end;
$$;

grant execute on function public.reject_workspace_invitation(uuid) to authenticated;
