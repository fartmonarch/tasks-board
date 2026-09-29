import { describe, expect, it } from "vitest";
import { filterTasks } from "./filterTasks";
import type { Task } from "../types";

const tasks: Task[] = [
  { id: 1, title: "Prepare release notes", status: "todo", priority: "high", assignee: "A" },
  { id: 2, title: "Review API design", status: "doing", priority: "medium", assignee: "B" },
  { id: 3, title: "Release checklist", status: "done", priority: "low", assignee: "C" },
];

describe("filterTasks", () => {
  it("matches a trimmed keyword without case sensitivity", () => {
    expect(filterTasks(tasks, "  RELEASE ", "all").map((task) => task.id)).toEqual([1, 3]);
  });
  it("filters by status", () => {
    expect(filterTasks(tasks, "", "doing").map((task) => task.id)).toEqual([2]);
  });
  it("combines keyword and status", () => {
    expect(filterTasks(tasks, "release", "done").map((task) => task.id)).toEqual([3]);
  });
  it("returns all tasks when both filters are empty", () => {
    expect(filterTasks(tasks, "   ", "all")).toEqual(tasks);
  });
  it("returns an empty list when nothing matches", () => {
    expect(filterTasks(tasks, "missing", "all")).toEqual([]);
  });
});
