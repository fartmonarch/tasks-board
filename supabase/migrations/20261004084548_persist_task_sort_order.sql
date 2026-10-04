-- Persist one stable order within each task status without changing the
-- existing project access policies.
alter table public.tasks
  add column sort_order bigint not null default 0;

with ranked_tasks as (
  select id,
    row_number() over (
      partition by project_id, status
      order by created_at desc, id
    ) - 1 as position
  from public.tasks
)
update public.tasks as task
set sort_order = ranked_tasks.position
from ranked_tasks
where ranked_tasks.id = task.id;

create index tasks_project_status_sort_order_idx
  on public.tasks (project_id, status, sort_order, created_at desc, id);

grant update (sort_order) on public.tasks to authenticated;

create function public.reorder_project_tasks(
  target_project_id uuid,
  target_task_ids uuid[],
  target_statuses text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_count integer;
  distinct_count integer;
  visible_count integer;
  updated_count integer;
begin
  if target_project_id is null or target_task_ids is null or target_statuses is null
    or cardinality(target_task_ids) <> cardinality(target_statuses) then
    raise exception using errcode = '22023', message = 'Invalid task order';
  end if;

  requested_count := cardinality(target_task_ids);
  if requested_count = 0 then return; end if;
  if array_position(target_task_ids, null) is not null
    or array_position(target_statuses, null) is not null
    or exists (select 1 from unnest(target_statuses) as item(status)
      where item.status not in ('todo', 'doing', 'done')) then
    raise exception using errcode = '22023', message = 'Invalid task order';
  end if;

  select count(distinct item.task_id)::integer into distinct_count
    from unnest(target_task_ids) as item(task_id);
  if distinct_count <> requested_count then
    raise exception using errcode = '22023', message = 'Task order contains duplicate ids';
  end if;

  -- Prevent overlapping reorder requests from interleaving row updates.
  perform pg_advisory_xact_lock(hashtextextended(target_project_id::text, 0));

  select count(*)::integer into visible_count
    from public.tasks as task
    where task.project_id = target_project_id;
  if visible_count <> requested_count then
    raise exception using errcode = '40001', message = 'The task list changed; refresh and try again';
  end if;

  update public.tasks as task
    set status = changes.status,
        sort_order = changes.position - 1
    from unnest(target_task_ids, target_statuses) with ordinality
      as changes(task_id, status, position)
    where task.project_id = target_project_id
      and task.id = changes.task_id;
  get diagnostics updated_count = row_count;

  if updated_count <> requested_count then
    raise exception using errcode = '42501', message = 'Task order was rejected by project permissions';
  end if;
end;
$$;

revoke all on function public.reorder_project_tasks(uuid, uuid[], text[])
  from public, anon, authenticated, service_role;
grant execute on function public.reorder_project_tasks(uuid, uuid[], text[])
  to authenticated;

comment on column public.tasks.sort_order is
  'Position within a project status column; writes use the existing tasks UPDATE RLS policies.';
comment on function public.reorder_project_tasks(uuid, uuid[], text[]) is
  'Atomic invoker RPC for task board ordering. Existing GRANT and RLS rules authorize status/order updates; archived projects remain read-only.';

notify pgrst, 'reload schema';
