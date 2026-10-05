-- Task creation explicitly supplies the initial position for its status column.
-- Preserve the existing column-level insert policy and add only that column.
grant insert (sort_order) on table public.tasks to authenticated;
