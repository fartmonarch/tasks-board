-- Keep the create RPCs transactional while enforcing the caller's RLS policies.
alter function public.create_team(text) security invoker;
alter function public.create_project(uuid, text) security invoker;

-- Newly created rows must be readable by their creator for INSERT ... RETURNING.
create policy teams_select_creator
  on public.teams for select to authenticated
  using (created_by = (select auth.uid()));

create policy projects_select_creator
  on public.projects for select to authenticated
  using (created_by = (select auth.uid()));
