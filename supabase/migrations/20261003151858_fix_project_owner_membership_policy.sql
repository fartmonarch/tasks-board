-- RLS policies cannot read projects.created_by through the authenticated
-- column grant. Keep the creator check private and evaluate it in a helper.
create or replace function private.is_project_creator(target_project_id uuid)
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
      and p.created_by = (select auth.uid())
  );
$$;
revoke all on function private.is_project_creator(uuid) from public, anon;
grant execute on function private.is_project_creator(uuid) to authenticated;

drop policy project_members_insert_self_member_or_creator_owner
  on public.project_members;
create policy project_members_insert_self_member_or_creator_owner
  on public.project_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      role = 'member'
      or (role = 'owner' and (select private.is_project_creator(project_id)))
    )
  );

comment on function private.is_project_creator(uuid) is
  'RLS helper that confirms the current authenticated user created the target project without exposing projects.created_by through column grants.';
comment on policy project_members_insert_self_member_or_creator_owner on public.project_members is
  'Users may self-join as member; only the project creator may insert their owner row during project creation. Open discovery and self-join are transitional.';
