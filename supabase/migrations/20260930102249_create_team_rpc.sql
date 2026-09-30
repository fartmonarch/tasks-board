-- Create a team and its initial admin membership atomically using the signed-in identity.
create or replace function public.create_team(team_name text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_team_id uuid;
  normalized_name text := btrim(team_name);
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  insert into public.teams (name, created_by)
  values (normalized_name, actor_id)
  returning teams.id into new_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (new_team_id, actor_id, 'admin');

  return query select new_team_id, normalized_name;
end;
$$;

revoke all on function public.create_team(text) from public, anon, authenticated;
grant execute on function public.create_team(text) to authenticated;
