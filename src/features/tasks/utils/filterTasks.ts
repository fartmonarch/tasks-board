import type { Task } from "../types";

export type TaskStatusFilter = "all" | Task["status"];

export function filterTasks(tasks: Task[], search: string, status: TaskStatusFilter) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return tasks.filter((task) => {
    const matchesSearch = task.title.toLocaleLowerCase().includes(normalizedSearch);
    return matchesSearch && (status === "all" || task.status === status);
  });
}
