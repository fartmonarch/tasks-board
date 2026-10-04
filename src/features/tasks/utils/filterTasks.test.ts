import { describe, expect, it } from "vitest";
import { filterTasks } from "./filterTasks";
import type { Task } from "../types";

const tasks: Task[] = [
  { id: "task-1", title: "Prepare release notes", status: "todo", priority: "high", assignee: "A", assigneeUserId: null, createdBy: "user-id" },
  { id: "task-2", title: "Review API design", status: "doing", priority: "medium", assignee: "B", assigneeUserId: null, createdBy: "user-id" },
  { id: "task-3", title: "Release checklist", status: "done", priority: "low", assignee: "C", assigneeUserId: null, createdBy: "user-id" },
];

describe("filterTasks", () => {
  it("matches a trimmed keyword without case sensitivity", () => {
    expect(filterTasks(tasks, "  RELEASE ", "all").map((task) => task.id)).toEqual(["task-1", "task-3"]);
  });
  it("filters by status", () => {
    expect(filterTasks(tasks, "", "doing").map((task) => task.id)).toEqual(["task-2"]);
  });
  it("combines keyword and status", () => {
    expect(filterTasks(tasks, "release", "done").map((task) => task.id)).toEqual(["task-3"]);
  });
  it("returns all tasks when both filters are empty", () => {
    expect(filterTasks(tasks, "   ", "all")).toEqual(tasks);
  });
  it("returns an empty list when nothing matches", () => {
    expect(filterTasks(tasks, "missing", "all")).toEqual([]);
  });
});
