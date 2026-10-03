-- Add project-level owner/member roles and a protected global admin registry.
-- This migration only adds metadata and policies; it preserves all business rows.

alter table public.project_members
  add column role text not null default 'member'
  constraint project_members_role_check check (role in ('owner', 'member'));

-- The prior read-only data audit found a creator membership for every project.
-- Backfill without inserting, deleting, or changing any membership relation.
update public.project_members as pm
set role = 'owner'
from public.projects as p
where p.id = pm.project_id
  and p.created_by = pm.user_id;

do $$
begin
  if exists (
    select 1
    from public.projects as p
    left join public.project_members as pm
      on pm.project_id = p.id
     and pm.user_id = p.created_by
     and pm.role = 'owner'
    where pm.user_id is null
  ) then
    raise exception 'Every project creator must have an owner membership';
  end if;
end;
$$;

create unique index project_members_one_owner_per_project_idx
  on public.project_members (project_id)
  where role = 'owner';

create table private.system_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null
);
alter table private.system_admins enable row level security;
revoke all on table private.system_admins from public, anon, authenticated, service_role;

create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.system_admins as sa
    where sa.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_system_admin() from public, anon;
grant execute on function private.is_system_admin() to authenticated;

create or replace function private.is_project_owner(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members as pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and pm.role = 'owner'
  );
$$;
revoke all on function private.is_project_owner(uuid) from public, anon;
grant execute on function private.is_project_owner(uuid) to authenticated;

create or replace function private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_system_admin()) or exists (
    select 1
    from public.project_members as pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
  );
$$;
revoke all on function private.can_access_project(uuid) from public, anon;
grant execute on function private.can_access_project(uuid) to authenticated;

drop policy projects_update_creator on public.projects;
create policy projects_update_owner_or_system_admin
  on public.projects for update to authenticated
  using (
    (select private.is_project_owner(id))
    or (select private.is_system_admin())
  )
  with check (
    (select private.is_project_owner(id))
    or (select private.is_system_admin())
  );

drop policy projects_delete_creator on public.projects;
create policy projects_delete_system_admin
  on public.projects for delete to authenticated
  using ((select private.is_system_admin()));

drop policy project_members_insert_self on public.project_members;
create policy project_members_insert_self_member_or_creator_owner
  on public.project_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      role = 'member'
      or (
        role = 'owner'
        and exists (
          select 1
          from public.projects as p
          where p.id = project_id
            and p.created_by = (select auth.uid())
        )
      )
    )
  );

create or replace function public.create_project(project_name text)
returns table (id uuid, name text)
language plpgsql
security invoker
set search_path = ''
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
revoke all on function public.create_project(text) from public, anon, authenticated;
grant execute on function public.create_project(text) to authenticated;

drop policy tasks_delete_authorized on public.tasks;
create policy tasks_delete_creator_owner_or_system_admin
  on public.tasks for delete to authenticated
  using (
    (select private.is_system_admin())
    or (select private.is_project_owner(project_id))
    or (
      created_by = (select auth.uid())
      and (select private.can_access_project(project_id))
    )
  );

-- The create_project invoker RPC and the open self-join path use the same
-- INSERT grant. RLS above limits owner-role insertion to a project's creator.
grant select (role), insert (role) on public.project_members to authenticated;

comment on table public.project_members is
  'Project membership. role is owner for the project creator and member for users who join; invitation-only membership is a planned follow-up.';
comment on column public.project_members.role is
  'Project business role: owner or member. Ordinary users cannot change their own role.';
comment on table private.system_admins is
  'Protected global application administrators. Manage through trusted SQL operations only; never expose this table through the Data API.';
comment on function private.is_system_admin() is
  'RLS helper that checks the current authenticated user against the private system administrator registry.';
comment on function private.is_project_owner(uuid) is
  'RLS helper that checks whether the current authenticated user is the owner of a project.';
comment on function private.can_access_project(uuid) is
  'RLS helper that grants project access to project members and system administrators.';
comment on function public.create_project(text) is
  'SECURITY INVOKER RPC. Creates a project and its creator owner membership atomically; caller remains subject to GRANT and RLS.';
comment on table public.tasks is
  'Task records belong to a project. Project owners and system administrators can manage project tasks; ordinary members can delete only their own tasks.';
comment on policy projects_update_owner_or_system_admin on public.projects is
  'The current project owner or a system administrator may update the project; lifecycle fields are implemented in follow-up work.';
comment on policy projects_delete_system_admin on public.projects is
  'Only a system administrator may permanently delete projects in the current release; project lifecycle controls are deferred.';
comment on policy project_members_insert_self_member_or_creator_owner on public.project_members is
  'Users may self-join as member; only the creator may insert their owner row during project creation. Open discovery and self-join are transitional.';
comment on policy tasks_delete_creator_owner_or_system_admin on public.tasks is
  'Task creators may delete their own tasks; project owners and system administrators may delete tasks within their scope.';
