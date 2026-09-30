-- Create a project and grant its creator membership atomically.
create or replace function public.create_project(target_team_id uuid, project_name text)
returns table (id uuid, team_id uuid, name text)
language plpgsql
security definer
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

  if not private.is_team_admin(target_team_id) then
    raise exception using errcode = '42501', message = 'Only a team admin can create projects';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (target_team_id, actor_id, 'admin')
  on conflict (team_id, user_id) do update set role = 'admin';

  insert into public.projects (team_id, name, created_by)
  values (target_team_id, normalized_name, actor_id)
  returning projects.id into new_project_id;

  insert into public.project_members (team_id, project_id, user_id)
  values (target_team_id, new_project_id, actor_id);

  return query select new_project_id, target_team_id, normalized_name;
end;
$$;

revoke all on function public.create_project(uuid, text) from public, anon, authenticated;
grant execute on function public.create_project(uuid, text) to authenticated;
