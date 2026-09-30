-- Let authenticated users discover project names and join a project atomically.
-- These narrow RPCs intentionally bypass RLS; they expose only project/team names
-- and can add only the caller's own membership.
create or replace function public.list_joinable_projects()
returns table (project_id uuid, project_name text, team_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, t.name
  from public.projects as p
  join public.teams as t on t.id = p.team_id
  where (select auth.uid()) is not null
    and not private.is_team_admin(p.team_id)
    and not exists (
      select 1
      from public.project_members as pm
      where pm.project_id = p.id
        and pm.user_id = (select auth.uid())
    )
  order by t.name, p.name;
$$;

create or replace function public.join_project(target_project_id uuid)
returns table (project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_team_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select p.team_id
    into target_team_id
  from public.projects as p
  where p.id = target_project_id;

  if target_team_id is null then
    raise exception using errcode = 'P0002', message = 'Project not found';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (target_team_id, actor_id, 'member')
  on conflict (team_id, user_id) do nothing;

  insert into public.project_members (team_id, project_id, user_id)
  values (target_team_id, target_project_id, actor_id)
  on conflict (project_id, user_id) do nothing;

  return query select target_project_id;
end;
$$;

revoke all on function public.list_joinable_projects() from public, anon, authenticated;
grant execute on function public.list_joinable_projects() to authenticated;
revoke all on function public.join_project(uuid) from public, anon, authenticated;
grant execute on function public.join_project(uuid) to authenticated;
