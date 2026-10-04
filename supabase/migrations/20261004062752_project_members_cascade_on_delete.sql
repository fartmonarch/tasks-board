-- The 20260930 team-removal migration dropped the composite project FK.
-- Restore a direct FK so permanent deletion also removes memberships.
do $$
begin
  if exists (
    select 1 from public.project_members as pm
    left join public.projects as p on p.id = pm.project_id
    where p.id is null
  ) then
    raise exception 'Orphan project memberships require review before adding the FK';
  end if;
end;
$$;

alter table public.project_members
  add constraint project_members_project_id_fkey
  foreign key (project_id) references public.projects (id) on delete cascade;

comment on constraint project_members_project_id_fkey on public.project_members is
  'Permanent project deletion removes membership rows; task assignees still clear when an individual member is removed.';
