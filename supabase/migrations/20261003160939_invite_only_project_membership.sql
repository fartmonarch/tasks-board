-- Invite-only membership. Existing business rows and roles remain untouched.
-- The private schema must remain outside the Data API exposed schemas.
create table private.project_invitations (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null,
  check (expires_at = created_at + interval '24 hours'),
  check (consumed_by is null or consumed_at is not null)
);
create index project_invitations_project_id_idx
  on private.project_invitations (project_id);
alter table private.project_invitations enable row level security;
revoke all on table private.project_invitations
  from public, anon, authenticated, service_role;

drop policy projects_select_authenticated on public.projects;
create policy projects_select_member_or_system_admin
  on public.projects for select to authenticated
  using ((select private.can_access_project(id)));

-- Close both table-write paths. Only the narrow RPCs below may create projects
-- and memberships, so clients cannot leave an orphan project or bypass invites.
drop policy projects_insert_creator on public.projects;
drop policy project_members_insert_self_member_or_creator_owner
  on public.project_members;
revoke insert on public.projects, public.project_members from authenticated;
revoke insert (name, created_by) on public.projects from authenticated;
revoke insert (project_id, user_id, role) on public.project_members from authenticated;

create function private.create_project(project_name text)
returns table (id uuid, name text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_project_id uuid;
  normalized_name text := btrim(project_name);
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  insert into public.projects (name, created_by)
    values (normalized_name, actor_id)
    returning projects.id into new_project_id;
  insert into public.project_members (project_id, user_id, role)
    values (new_project_id, actor_id, 'owner');
  return query select new_project_id, normalized_name;
end;
$$;
create or replace function public.create_project(project_name text)
returns table (id uuid, name text)
language sql security invoker set search_path = ''
as $$ select * from private.create_project(project_name); $$;

create function public.can_invite_to_project(target_project_id uuid)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select (private.is_project_owner(target_project_id) or private.is_system_admin())
    and exists (select 1 from public.projects as p where p.id = target_project_id);
$$;

create function private.create_project_invitation(target_project_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  raw_token text;
  issued_at timestamptz := clock_timestamp();
begin
  if actor_id is null or not (
    private.is_project_owner(target_project_id) or private.is_system_admin()
  ) then
    raise exception using errcode = '42501', message = 'Only an owner or system administrator can invite';
  end if;
  if not exists (select 1 from public.projects as p where p.id = target_project_id) then
    raise exception using errcode = 'P0002', message = 'Project not found';
  end if;
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.project_invitations
    (token_hash, project_id, created_by, created_at, expires_at)
    values (extensions.digest(encode(extensions.digest(raw_token, 'sha256'), 'hex'), 'sha256'), target_project_id,
      actor_id, issued_at, issued_at + interval '24 hours');
  -- Return the secret once; do not store or log it.
  return query select raw_token, issued_at + interval '24 hours';
end;
$$;
create function public.create_project_invitation(target_project_id uuid)
returns table (token text, expires_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.create_project_invitation(target_project_id); $$;

-- Redemption receives hex(SHA-256(token)), never the raw token. Store a second
-- hash of that proof so a leaked database hash cannot itself redeem an invite.
create function private.redeem_project_invitation(invite_hash text)
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
  -- Existing members can enter without spending a seat, even after consumption
  -- or expiry. An unrecognized credential never reveals a project identifier.
  if exists (select 1 from public.project_members as pm
    where pm.project_id = invitation.project_id and pm.user_id = actor_id) then
    return query select invitation.project_id;
    return;
  end if;
  if invitation.consumed_at is not null or invitation.expires_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'Invitation unavailable';
  end if;
  insert into public.project_members (project_id, user_id, role)
    values (invitation.project_id, actor_id, 'member')
    on conflict on constraint project_members_pkey do nothing;
  get diagnostics inserted_rows = row_count;
  -- Another invitation may have just joined this same user. Do not consume ours.
  if inserted_rows = 1 then
    -- Membership uniqueness can also block; expiry must still hold after it.
    if invitation.expires_at <= clock_timestamp() then
      raise exception using errcode = 'P0001', message = 'Invitation unavailable';
    end if;
    update private.project_invitations as i
      set consumed_at = clock_timestamp(), consumed_by = actor_id
      where i.token_hash = invitation.token_hash;
  end if;
  return query select invitation.project_id;
end;
$$;
create function public.redeem_project_invitation(invite_hash text)
returns table (project_id uuid)
language sql security invoker set search_path = ''
as $$ select * from private.redeem_project_invitation(invite_hash); $$;

revoke all on function private.create_project(text),
  private.create_project_invitation(uuid), private.redeem_project_invitation(text),
  public.create_project(text), public.can_invite_to_project(uuid),
  public.create_project_invitation(uuid), public.redeem_project_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function private.create_project(text),
  private.create_project_invitation(uuid), private.redeem_project_invitation(text),
  public.create_project(text), public.can_invite_to_project(uuid),
  public.create_project_invitation(uuid), public.redeem_project_invitation(text)
  to authenticated;

comment on table private.project_invitations is
  'Private invitation hashes, fixed 24-hour expiry and one new member per invitation. No direct client access or raw token storage.';
comment on table public.projects is
  'Projects visible to their members and global administrators. New projects and owner memberships are created atomically through create_project.';
comment on column public.projects.created_by is
  'Historical project creator. Current owner authority comes from project_members.role, not this field.';
comment on table public.project_members is
  'Project owner/member relations. Only atomic project creation and invitation redemption may add members; public self-join is closed.';
comment on column public.project_members.user_id is
  'Member identity taken from auth.uid() inside trusted creation or redemption functions, never supplied by the client.';
comment on function public.create_project(text) is
  'Invoker API wrapper for private authenticated atomic project/owner creation; direct table insertion is revoked.';
comment on function public.create_project_invitation(uuid) is
  'Owner or global administrator generates a 256-bit secret returned once; only SHA-256(hex(SHA-256(secret))) is stored.';
comment on function public.redeem_project_invitation(text) is
  'Authenticated hash-only redemption. A row lock serializes membership creation and invitation consumption; existing members do not consume.';
comment on policy projects_select_member_or_system_admin on public.projects is
  'Only project members and global administrators may discover/read a project; public discovery is closed.';
