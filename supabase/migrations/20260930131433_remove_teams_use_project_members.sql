-- Flatten access control to projects. Preserve projects, tasks, comments, and
-- every existing project member before removing team-only records and columns.
insert into public.project_members (team_id, project_id, user_id)
select p.team_id, p.id, p.created_by
from public.projects as p
on conflict (project_id, user_id) do nothing;

insert into public.project_members (team_id, project_id, user_id)
select p.team_id, p.id, tm.user_id
from public.projects as p
join public.teams as t on t.id = p.team_id
join public.team_members as tm on tm.team_id = p.team_id
where tm.role = 'admin' or tm.user_id = t.created_by
on conflict (project_id, user_id) do nothing;

drop policy if exists profiles_select_shared_team on public.profiles;
drop policy if exists projects_select_authorized on public.projects;
drop policy if exists projects_select_creator on public.projects;
drop policy if exists projects_insert_admin on public.projects;
drop policy if exists projects_update_admin on public.projects;
drop policy if exists projects_delete_admin on public.projects;
drop policy if exists project_members_select_authorized on public.project_members;
drop policy if exists project_members_insert_admin on public.project_members;
drop policy if exists project_members_delete_admin on public.project_members;
drop policy if exists teams_select_member on public.teams;
drop policy if exists teams_select_creator on public.teams;
drop policy if exists teams_insert_creator on public.teams;
drop policy if exists teams_update_admin on public.teams;
drop policy if exists teams_delete_admin on public.teams;
drop policy if exists team_members_select_member on public.team_members;
drop policy if exists team_members_insert_admin on public.team_members;
drop policy if exists team_members_update_admin on public.team_members;
drop policy if exists team_members_delete_admin on public.team_members;

drop function public.create_team(text);
drop function public.create_project(uuid, text);
drop function public.list_joinable_projects();
drop function public.join_project(uuid);
drop function private.shares_team_with(uuid);
drop function private.can_manage_project_members(uuid);

create or replace function private.can_access_project(target_project_id uuid)
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
  );
$$;

drop function private.is_team_admin(uuid);
drop function private.is_team_member(uuid);

alter table public.project_members
  drop constraint project_members_project_id_team_id_fkey,
  drop constraint project_members_team_id_user_id_fkey,
  drop column team_id;

alter table public.projects
  drop constraint projects_id_team_id_key,
  drop constraint projects_team_id_fkey,
  drop column team_id;

drop table public.team_members;
drop table public.teams;

drop index if exists public.projects_team_name_unique_idx;
create unique index projects_name_unique_idx
  on public.projects (lower(btrim(name)));

create or replace function private.shares_project_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid()) or exists (
    select 1
    from public.project_members as mine
    join public.project_members as theirs using (project_id)
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user_id
  );
$$;

revoke all on function private.shares_project_with(uuid) from public;
grant execute on function private.shares_project_with(uuid) to authenticated;

create policy profiles_select_project_members
  on public.profiles for select to authenticated
  using ((select private.shares_project_with(id)));

create policy projects_select_authenticated
  on public.projects for select to authenticated
  using ((select auth.uid()) is not null);
create policy projects_insert_creator
  on public.projects for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy projects_update_creator
  on public.projects for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy projects_delete_creator
  on public.projects for delete to authenticated
  using (created_by = (select auth.uid()));

create policy project_members_select_self_or_project_member
  on public.project_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_access_project(project_id))
  );
create policy project_members_insert_self
  on public.project_members for insert to authenticated
  with check (user_id = (select auth.uid()));

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

  insert into public.project_members (project_id, user_id)
  values (new_project_id, actor_id);

  return query select new_project_id, normalized_name;
end;
$$;

revoke all on function public.create_project(text) from public, anon, authenticated;
grant execute on function public.create_project(text) to authenticated;

revoke all on table public.projects from anon, authenticated, public;
grant select (id, name), insert (name, created_by), update (name), delete
  on public.projects to authenticated;
revoke all on table public.project_members from anon, authenticated, public;
grant select (project_id, user_id), insert (project_id, user_id)
  on public.project_members to authenticated;
