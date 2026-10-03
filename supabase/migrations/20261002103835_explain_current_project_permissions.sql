-- Documentation only: describe the current project model and existing access rules.
-- This migration does not alter data, grants, policies, or runtime behavior.

comment on table public.profiles is
  'Application profile for a Supabase Auth user. A profile row is created/filled by application code; users edit their own display name.';
comment on column public.profiles.id is
  'Same UUID as auth.users.id; identifies the profile owner.';
comment on column public.profiles.display_name is
  'Name shown in project member and task assignee lists; editable by this user.';
comment on column public.profiles.created_at is
  'Time this application profile row was created.';

comment on table public.projects is
  'Project workspace. Authenticated users can browse project IDs/names and join; created_by identifies the creator.';
comment on column public.projects.id is
  'Stable project identifier referenced by memberships and tasks.';
comment on column public.projects.name is
  'Human-readable project name; unique after trimming whitespace and ignoring case.';
comment on column public.projects.created_by is
  'Supabase Auth user who created the project; current project-management policies use this as the creator check.';
comment on column public.projects.created_at is
  'Time the project row was created.';

comment on table public.project_members is
  'Membership relation between a project and a user. Current schema has no leader/member role column: every project member has the same task permissions.';
comment on column public.project_members.project_id is
  'Project to which the user belongs.';
comment on column public.project_members.user_id is
  'Supabase Auth user UUID; the insert policy only permits a user to add their own UUID.';
comment on column public.project_members.joined_at is
  'Time this user joined the project.';

comment on table public.tasks is
  'Task records owned by a project. Project members can create, read, update, and delete tasks under current RLS policies.';
comment on column public.tasks.id is
  'Stable task identifier.';
comment on column public.tasks.project_id is
  'Owning project; RLS uses this value to verify project membership.';
comment on column public.tasks.title is
  'Task title, trimmed length must be from 1 to 500 characters.';
comment on column public.tasks.status is
  'Task workflow state: todo, doing, or done.';
comment on column public.tasks.priority is
  'Task priority: low, medium, or high.';
comment on column public.tasks.assignee_user_id is
  'Optional assignee; the composite foreign key requires the assignee to be a member of this same project.';
comment on column public.tasks.created_by is
  'Supabase Auth user who created the task; task insert policy requires this to be the current user.';
comment on column public.tasks.created_at is
  'Time the task row was created.';

comment on table public.comments is
  'Comments attached to tasks. Project members can read and add comments; authenticated users have no current update/delete policy.';
comment on column public.comments.id is
  'Stable comment identifier.';
comment on column public.comments.task_id is
  'Task this comment belongs to; RLS checks access through the task project.';
comment on column public.comments.author_id is
  'Supabase Auth user who wrote the comment; insert policy requires the current user.';
comment on column public.comments.content is
  'Comment body, trimmed length must be from 1 to 5000 characters.';
comment on column public.comments.created_at is
  'Time the comment was created.';

comment on function public.create_project(text) is
  'SECURITY INVOKER RPC. Creates a project and its creator membership in one transaction; caller remains subject to GRANT and RLS.';
comment on function private.can_access_project(uuid) is
  'RLS helper: true only when auth.uid() has a row in project_members for the given project.';
comment on function private.can_access_task(uuid) is
  'RLS helper: resolves the task project and checks whether auth.uid() is a project member.';
comment on function private.shares_project_with(uuid) is
  'RLS helper: allows a user to read their own profile and profiles of people sharing at least one project.';

comment on policy profiles_select_project_members on public.profiles is
  'Authenticated users can read their own profile and profiles of users sharing a project.';
comment on policy profiles_insert_self on public.profiles is
  'A user may insert a profile only for auth.uid().';
comment on policy profiles_update_self on public.profiles is
  'A user may update only their own profile row.';

comment on policy projects_select_authenticated on public.projects is
  'Every authenticated user may discover project IDs and names; task access is still separately protected.';
comment on policy projects_insert_creator on public.projects is
  'A project can be created only with created_by equal to auth.uid(); the create_project RPC also inserts the creator membership.';
comment on policy projects_update_creator on public.projects is
  'Only the project creator may update the project row.';
comment on policy projects_delete_creator on public.projects is
  'Only the project creator may delete the project; foreign keys cascade to its tasks and comments.';

comment on policy project_members_select_self_or_project_member on public.project_members is
  'A user can read their own membership rows; project members can read memberships for their shared project.';
comment on policy project_members_insert_self on public.project_members is
  'Any authenticated user may join a project by inserting only their own user_id. This is open self-join, not invite-only.';

comment on policy tasks_select_authorized on public.tasks is
  'Only members of the task project can read the task.';
comment on policy tasks_insert_authorized on public.tasks is
  'Only a project member may create a task, and created_by must equal auth.uid().';
comment on policy tasks_update_authorized on public.tasks is
  'Any member of the task project may update it; column GRANTs further limit updatable fields.';
comment on policy tasks_delete_authorized on public.tasks is
  'Any member of the task project may delete tasks under the current policy.';

comment on policy comments_select_authorized on public.comments is
  'Only members of the project containing the comment task may read the comment.';
comment on policy comments_insert_authorized on public.comments is
  'Only a member of the task project may add a comment, and author_id must equal auth.uid().';
