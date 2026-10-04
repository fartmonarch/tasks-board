-- Owner changes and project lifecycle are kept behind authenticated RPCs.
-- Existing task/comment rows remain when a member leaves. The composite
-- assignee FK clears only tasks.assignee_user_id on membership deletion.
alter table public.projects add column archived_at timestamptz;
grant select (archived_at) on public.projects to authenticated;

create function private.project_is_active(target_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.projects as p
    where p.id = target_project_id and p.archived_at is null);
$$;

create function private.require_active_project_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- The lock serializes invitation and membership insertion with archive.
  perform 1 from public.projects as p
    where p.id = new.project_id and p.archived_at is null for share;
  if not found then
    raise exception using errcode = '55000', message = 'Archived projects cannot accept new members or invitations';
  end if;
  return new;
end;
$$;
create trigger project_members_active_insert
  before insert on public.project_members for each row
  execute function private.require_active_project_insert();
create trigger project_invitations_active_insert
  before insert on private.project_invitations for each row
  execute function private.require_active_project_insert();

drop policy tasks_insert_authorized on public.tasks;
create policy tasks_insert_authorized on public.tasks for insert to authenticated
  with check (created_by = (select auth.uid())
    and (select private.can_access_project(project_id))
    and (select private.project_is_active(project_id)));
drop policy tasks_update_authorized on public.tasks;
create policy tasks_update_authorized on public.tasks for update to authenticated
  using ((select private.can_access_project(project_id))
    and (select private.project_is_active(project_id)))
  with check ((select private.can_access_project(project_id))
    and (select private.project_is_active(project_id)));
drop policy tasks_delete_creator_owner_or_system_admin on public.tasks;
create policy tasks_delete_creator_owner_or_system_admin
  on public.tasks for delete to authenticated
  using ((select private.project_is_active(project_id)) and (
    (select private.is_system_admin())
    or (select private.is_project_owner(project_id))
    or (created_by = (select auth.uid())
      and (select private.can_access_project(project_id)))));
drop policy comments_insert_authorized on public.comments;
create policy comments_insert_authorized on public.comments for insert to authenticated
  with check (author_id = (select auth.uid())
    and (select private.can_access_task(task_id))
    and exists (select 1 from public.tasks as t where t.id = task_id
      and (select private.project_is_active(t.project_id))));

-- Remove direct project deletion; callers must use the checked RPC.
drop policy projects_delete_system_admin on public.projects;
revoke delete on public.projects from authenticated;

create function private.remove_project_member(target_project_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := auth.uid(); target_role text;
begin
  perform 1 from public.projects as p where p.id = target_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Project not found'; end if;
  if actor_id is null or not private.is_project_owner(target_project_id) then
    raise exception using errcode = '42501', message = 'Only the current owner can remove a member';
  end if;
  select pm.role into target_role from public.project_members as pm
    where pm.project_id = target_project_id and pm.user_id = target_user_id;
  if target_role is null then
    raise exception using errcode = 'P0002', message = 'Member not found';
  end if;
  if target_role = 'owner' then
    raise exception using errcode = '22023', message = 'Transfer ownership before removing the owner';
  end if;
  delete from public.project_members as pm
    where pm.project_id = target_project_id and pm.user_id = target_user_id;
end;
$$;
create function public.remove_project_member(target_project_id uuid, target_user_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.remove_project_member(target_project_id, target_user_id); $$;

create function private.transfer_project_owner(target_project_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := auth.uid(); target_role text;
begin
  perform 1 from public.projects as p where p.id = target_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Project not found'; end if;
  if actor_id is null or not private.is_project_owner(target_project_id) then
    raise exception using errcode = '42501', message = 'Only the current owner can transfer ownership';
  end if;
  select pm.role into target_role from public.project_members as pm
    where pm.project_id = target_project_id and pm.user_id = target_user_id;
  if target_role is distinct from 'member' then
    raise exception using errcode = '22023', message = 'Choose another project member';
  end if;
  update public.project_members as pm set role = 'member'
    where pm.project_id = target_project_id and pm.user_id = actor_id and pm.role = 'owner';
  update public.project_members as pm set role = 'owner'
    where pm.project_id = target_project_id and pm.user_id = target_user_id and pm.role = 'member';
  if not found then
    raise exception using errcode = 'P0002', message = 'Target member changed; retry';
  end if;
end;
$$;
create function public.transfer_project_owner(target_project_id uuid, target_user_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.transfer_project_owner(target_project_id, target_user_id); $$;

create function private.set_project_archived(target_project_id uuid, should_archive boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_archived_at timestamptz;
begin
  select p.archived_at into current_archived_at from public.projects as p
    where p.id = target_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Project not found'; end if;
  if auth.uid() is null or not (
    private.is_project_owner(target_project_id) or private.is_system_admin()) then
    raise exception using errcode = '42501', message = 'Only an owner or system administrator can change project status';
  end if;
  if should_archive is null then
    raise exception using errcode = '22023', message = 'Invalid archive state';
  end if;
  if (current_archived_at is not null) = should_archive then
    raise exception using errcode = '22023', message = 'Project status already changed';
  end if;
  update public.projects as p
    set archived_at = case when should_archive then clock_timestamp() else null end
    where p.id = target_project_id;
end;
$$;
create function public.set_project_archived(target_project_id uuid, should_archive boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.set_project_archived(target_project_id, should_archive); $$;

create function private.delete_project_permanently(target_project_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.projects as p where p.id = target_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Project not found'; end if;
  if auth.uid() is null or not (
    private.is_project_owner(target_project_id) or private.is_system_admin()) then
    raise exception using errcode = '42501', message = 'Only an owner or system administrator can delete a project';
  end if;
  delete from public.projects as p where p.id = target_project_id;
end;
$$;
create function public.delete_project_permanently(target_project_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.delete_project_permanently(target_project_id); $$;

revoke all on function private.project_is_active(uuid),
  private.require_active_project_insert(),
  private.remove_project_member(uuid, uuid), public.remove_project_member(uuid, uuid),
  private.transfer_project_owner(uuid, uuid), public.transfer_project_owner(uuid, uuid),
  private.set_project_archived(uuid, boolean), public.set_project_archived(uuid, boolean),
  private.delete_project_permanently(uuid), public.delete_project_permanently(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.project_is_active(uuid),
  private.remove_project_member(uuid, uuid), public.remove_project_member(uuid, uuid),
  private.transfer_project_owner(uuid, uuid), public.transfer_project_owner(uuid, uuid),
  private.set_project_archived(uuid, boolean), public.set_project_archived(uuid, boolean),
  private.delete_project_permanently(uuid), public.delete_project_permanently(uuid)
  to authenticated;

comment on column public.projects.archived_at is
  'Archived projects remain readable, but task/comment writes and new joins are paused.';
comment on function public.remove_project_member(uuid, uuid) is
  'Current owner removes a non-owner member. Task assignment is cleared by FK; task and comment history stays.';
comment on function public.transfer_project_owner(uuid, uuid) is
  'Atomic owner transfer to an existing member. One-owner unique index remains enforced.';
comment on function public.delete_project_permanently(uuid) is
  'Owner/admin permanent deletion; project tasks, comments and invitations cascade.';
notify pgrst, 'reload schema';
