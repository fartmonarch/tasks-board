-- Preserve existing 24-hour invitations and add fixed one-hour group links.
alter table private.project_invitations
  add column mode text not null default 'single'
    constraint project_invitations_mode_check check (mode in ('single', 'group')),
  drop constraint project_invitations_check,
  add constraint project_invitations_lifetime_check check (
    expires_at = created_at + case mode
      when 'group' then interval '1 hour' else interval '24 hours' end
  ),
  add constraint project_invitations_consumption_check check (
    mode = 'single' or (consumed_at is null and consumed_by is null)
  );

create function private.create_project_invitation_with_mode(
  target_project_id uuid, invitation_mode text
)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  raw_token text;
  issued_at timestamptz := clock_timestamp();
  lifetime interval;
begin
  if actor_id is null or not (
    private.is_project_owner(target_project_id) or private.is_system_admin()
  ) then
    raise exception using errcode = '42501', message = 'Only an owner or system administrator can invite';
  end if;
  if invitation_mode is null or invitation_mode not in ('single', 'group') then
    raise exception using errcode = '22023', message = 'Invalid invitation mode';
  end if;
  if not exists (select 1 from public.projects as p where p.id = target_project_id) then
    raise exception using errcode = 'P0002', message = 'Project not found';
  end if;
  lifetime := case invitation_mode when 'group' then interval '1 hour' else interval '24 hours' end;
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.project_invitations
    (token_hash, project_id, created_by, created_at, expires_at, mode)
    values (extensions.digest(encode(extensions.digest(raw_token, 'sha256'), 'hex'), 'sha256'),
      target_project_id, actor_id, issued_at, issued_at + lifetime, invitation_mode);
  return query select raw_token, issued_at + lifetime;
end;
$$;
create function public.create_project_invitation_with_mode(
  target_project_id uuid, invitation_mode text
)
returns table (token text, expires_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.create_project_invitation_with_mode(target_project_id, invitation_mode); $$;

-- Keep the previous API signature for clients that have not updated yet.
create or replace function private.create_project_invitation(target_project_id uuid)
returns table (token text, expires_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.create_project_invitation_with_mode(target_project_id, 'single'); $$;

create or replace function private.redeem_project_invitation(invite_hash text)
returns table (project_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation private.project_invitations%rowtype;
  inserted_rows integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if invite_hash is null or invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'Invitation unavailable';
  end if;
  select i.* into invitation from private.project_invitations as i
    where i.token_hash = extensions.digest(invite_hash, 'sha256') for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Invitation unavailable';
  end if;
  if exists (select 1 from public.project_members as pm
    where pm.project_id = invitation.project_id and pm.user_id = actor_id) then
    return query select invitation.project_id;
    return;
  end if;
  if invitation.expires_at <= clock_timestamp()
    or (invitation.mode = 'single' and invitation.consumed_at is not null) then
    raise exception using errcode = 'P0001', message = 'Invitation unavailable';
  end if;
  insert into public.project_members (project_id, user_id, role)
    values (invitation.project_id, actor_id, 'member')
    on conflict on constraint project_members_pkey do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows = 1 then
    if invitation.expires_at <= clock_timestamp() then
      raise exception using errcode = 'P0001', message = 'Invitation unavailable';
    end if;
    if invitation.mode = 'single' then
      update private.project_invitations as i
        set consumed_at = clock_timestamp(), consumed_by = actor_id
        where i.token_hash = invitation.token_hash;
    end if;
  end if;
  return query select invitation.project_id;
end;
$$;

revoke all on function private.create_project_invitation_with_mode(uuid, text),
  public.create_project_invitation_with_mode(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.create_project_invitation_with_mode(uuid, text),
  public.create_project_invitation_with_mode(uuid, text) to authenticated;

comment on table private.project_invitations is
  'Private invitation hashes. single: one new member within 24 hours; group: unlimited new members within one hour. No raw tokens or client table access.';
comment on column private.project_invitations.mode is
  'Fixed invitation mode: single (24 hours, one new member) or group (one hour, no member count limit).';
comment on function public.create_project_invitation_with_mode(uuid, text) is
  'Owner/admin generation with server-validated fixed invitation modes. Returns a 256-bit secret once, stores only its double SHA-256 hash.';
comment on function public.redeem_project_invitation(text) is
  'Authenticated atomic redemption. Existing members do not consume; single invites consume once, group invites remain reusable until expiry.';

notify pgrst, 'reload schema';
