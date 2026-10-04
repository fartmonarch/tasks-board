import { beforeEach, expect, it, vi } from "vitest";
import { deleteTask } from "./taskApi";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  remove: vi.fn(),
  projectEq: vi.fn(),
  taskEq: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({ supabase: { from: mocks.from } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ delete: mocks.remove });
  mocks.remove.mockReturnValue({ eq: mocks.projectEq });
  mocks.projectEq.mockReturnValue({ eq: mocks.taskEq });
  mocks.taskEq.mockReturnValue({ select: mocks.select });
});

it("accepts deletion only when one row is returned", async () => {
  mocks.select.mockResolvedValue({ data: [{ id: "task-id" }], error: null });
  await expect(deleteTask("project-id", "task-id")).resolves.toBeUndefined();
  expect(mocks.from).toHaveBeenCalledWith("tasks");
  expect(mocks.projectEq).toHaveBeenCalledWith("project_id", "project-id");
  expect(mocks.taskEq).toHaveBeenCalledWith("id", "task-id");
  expect(mocks.select).toHaveBeenCalledWith("id");
});

it("rejects an RLS or missing-row zero-delete result", async () => {
  mocks.select.mockResolvedValue({ data: [], error: null });
  await expect(deleteTask("project-id", "task-id")).rejects.toThrow("任务未删除");
});

it("passes database deletion errors to the caller", async () => {
  mocks.select.mockResolvedValue({ data: null, error: new Error("permission denied") });
  await expect(deleteTask("project-id", "task-id")).rejects.toThrow("permission denied");
});
