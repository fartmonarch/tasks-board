-- Core team, project, task, and comment schema.
-- Expose only through authenticated grants; row access is controlled by RLS.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, team_id)
);

create table public.project_members (
  team_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, team_id)
    references public.projects (id, team_id) on delete cascade,
  foreign key (team_id, user_id)
    references public.team_members (team_id, user_id) on delete cascade
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 500),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_user_id uuid,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (project_id, assignee_user_id)
    references public.project_members (project_id, user_id)
    on delete set null (assignee_user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  content text not null check (char_length(trim(content)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index team_members_user_id_idx on public.team_members (user_id, team_id);
create index projects_team_id_idx on public.projects (team_id, created_at desc);
create index project_members_user_id_idx on public.project_members (user_id, project_id);
create index tasks_project_id_created_at_idx on public.tasks (project_id, created_at desc);
create index comments_task_id_created_at_idx on public.comments (task_id, created_at);

create function private.is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams as t
    where t.id = target_team_id
      and t.created_by = (select auth.uid())
  ) or exists (
    select 1
    from public.team_members as tm
    where tm.team_id = target_team_id
      and tm.user_id = (select auth.uid())
  );
$$;

create function private.is_team_admin(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams as t
    where t.id = target_team_id
      and t.created_by = (select auth.uid())
  ) or exists (
    select 1
    from public.team_members as tm
    where tm.team_id = target_team_id
      and tm.user_id = (select auth.uid())
      and tm.role = 'admin'
  );
$$;

create function private.shares_team_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid()) or exists (
    select 1
    from public.team_members as mine
    join public.team_members as theirs using (team_id)
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user_id
  ) or exists (
    select 1
    from public.teams as t
    join public.team_members as tm on tm.team_id = t.id
    where t.created_by = (select auth.uid())
      and tm.user_id = target_user_id
  ) or exists (
    select 1
    from public.teams as t
    join public.team_members as tm on tm.team_id = t.id
    where tm.user_id = (select auth.uid())
      and t.created_by = target_user_id
  );
$$;

create function private.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as p
    where p.id = target_project_id
      and (
        private.is_team_admin(p.team_id)
        or exists (
          select 1
          from public.project_members as pm
          where pm.project_id = p.id
            and pm.user_id = (select auth.uid())
        )
      )
  );
$$;

create function private.can_manage_project_members(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects as p
    where p.id = target_project_id
      and private.is_team_admin(p.team_id)
  );
$$;

create function private.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks as t
    where t.id = target_task_id
      and private.can_access_project(t.project_id)
  );
$$;

revoke all on function private.is_team_member(uuid) from public;
revoke all on function private.is_team_admin(uuid) from public;
revoke all on function private.shares_team_with(uuid) from public;
revoke all on function private.can_access_project(uuid) from public;
revoke all on function private.can_manage_project_members(uuid) from public;
revoke all on function private.can_access_task(uuid) from public;
grant execute on function private.is_team_member(uuid) to authenticated;
grant execute on function private.is_team_admin(uuid) to authenticated;
grant execute on function private.shares_team_with(uuid) to authenticated;
grant execute on function private.can_access_project(uuid) to authenticated;
grant execute on function private.can_manage_project_members(uuid) to authenticated;
grant execute on function private.can_access_task(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;

create policy profiles_select_shared_team
  on public.profiles for select to authenticated
  using ((select private.shares_team_with(id)));
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy teams_select_member
  on public.teams for select to authenticated
  using ((select private.is_team_member(id)));
create policy teams_insert_creator
  on public.teams for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy teams_update_admin
  on public.teams for update to authenticated
  using ((select private.is_team_admin(id)))
  with check ((select private.is_team_admin(id)));
create policy teams_delete_admin
  on public.teams for delete to authenticated
  using ((select private.is_team_admin(id)));

create policy team_members_select_member
  on public.team_members for select to authenticated
  using ((select private.is_team_member(team_id)));
create policy team_members_insert_admin
  on public.team_members for insert to authenticated
  with check ((select private.is_team_admin(team_id)));
create policy team_members_update_admin
  on public.team_members for update to authenticated
  using ((select private.is_team_admin(team_id)))
  with check ((select private.is_team_admin(team_id)));
create policy team_members_delete_admin
  on public.team_members for delete to authenticated
  using ((select private.is_team_admin(team_id)));

create policy projects_select_authorized
  on public.projects for select to authenticated
  using ((select private.can_access_project(id)));
create policy projects_insert_admin
  on public.projects for insert to authenticated
  with check ((select private.is_team_admin(team_id)) and created_by = (select auth.uid()));
create policy projects_update_admin
  on public.projects for update to authenticated
  using ((select private.is_team_admin(team_id)))
  with check ((select private.is_team_admin(team_id)));
create policy projects_delete_admin
  on public.projects for delete to authenticated
  using ((select private.is_team_admin(team_id)));

create policy project_members_select_authorized
  on public.project_members for select to authenticated
  using ((select private.can_access_project(project_id)));
create policy project_members_insert_admin
  on public.project_members for insert to authenticated
  with check ((select private.can_manage_project_members(project_id)));
create policy project_members_delete_admin
  on public.project_members for delete to authenticated
  using ((select private.can_manage_project_members(project_id)));

create policy tasks_select_authorized
  on public.tasks for select to authenticated
  using ((select private.can_access_project(project_id)));
create policy tasks_insert_authorized
  on public.tasks for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_access_project(project_id))
  );
create policy tasks_update_authorized
  on public.tasks for update to authenticated
  using ((select private.can_access_project(project_id)))
  with check ((select private.can_access_project(project_id)));
create policy tasks_delete_authorized
  on public.tasks for delete to authenticated
  using ((select private.can_access_project(project_id)));

create policy comments_select_authorized
  on public.comments for select to authenticated
  using ((select private.can_access_task(task_id)));
create policy comments_insert_authorized
  on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.can_access_task(task_id))
  );

grant usage on schema public to authenticated;
revoke all on table public.profiles, public.teams, public.team_members,
  public.projects, public.project_members, public.tasks, public.comments
  from anon, authenticated, public;
grant select, insert (id, display_name), update (display_name)
  on public.profiles to authenticated;
grant select, insert (name, created_by), update (name), delete
  on public.teams to authenticated;
grant select, insert (team_id, user_id, role), update (role), delete
  on public.team_members to authenticated;
grant select, insert (team_id, name, created_by), update (name), delete
  on public.projects to authenticated;
grant select, insert (team_id, project_id, user_id), delete
  on public.project_members to authenticated;
grant select, insert (project_id, title, status, priority, assignee_user_id, created_by),
  update (title, status, priority, assignee_user_id), delete
  on public.tasks to authenticated;
grant select, insert (task_id, author_id, content)
  on public.comments to authenticated;
