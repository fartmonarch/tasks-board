-- Preserve existing projects while making same-team names unique (case and outer spaces ignored).
with ranked_projects as (
  select
    id,
    row_number() over (
      partition by team_id, lower(btrim(name))
      order by created_at, id
    ) as duplicate_number
  from public.projects
)
update public.projects as p
set name = left(btrim(p.name), 110) || ' (' || ranked_projects.duplicate_number || ')'
from ranked_projects
where p.id = ranked_projects.id
  and ranked_projects.duplicate_number > 1;

create unique index projects_team_name_unique_idx
  on public.projects (team_id, lower(btrim(name)));
