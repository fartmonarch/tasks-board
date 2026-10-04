import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthSessionContext } from "../features/auth/AuthSessionContext";
import App from "./App";

const { workspace, project, members, tasks, admin, role, allProjects, removeTask } = vi.hoisted(() => ({
  workspace: vi.fn(),
  project: vi.fn(),
  members: vi.fn(),
  tasks: vi.fn(),
  admin: vi.fn(),
  role: vi.fn(),
  allProjects: vi.fn(),
  removeTask: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../features/projects/api/projectApi", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../features/projects/api/projectApi")
  >()),
  getWorkspace: workspace,
  getProjectById: project,
  getProjectMembers: members,
  getCurrentUserIsSystemAdmin: admin,
  getCurrentProjectRole: role,
  getAllProjects: allProjects,
}));
vi.mock("../features/tasks/api/taskApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/tasks/api/taskApi")>()),
  getTasks: tasks,
  deleteTask: removeTask,
}));
vi.mock("../features/projects/components/ProjectInviteButton", () => ({
  ProjectInviteButton: () => null,
}));
beforeEach(() => {
  removeTask.mockReset();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  admin.mockResolvedValue(false);
  role.mockResolvedValue("member");
  allProjects.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderRoute(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthSessionContext.Provider value={{ user: { id: "user-id" } } as Session}>
        <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
      </AuthSessionContext.Provider>
    </QueryClientProvider>,
  );
}

it("returns from the board to the existing My Projects route", async () => {
  project.mockResolvedValue({ id: "p1", name: "测试项目" });
  members.mockResolvedValue([]);
  tasks.mockResolvedValue([]);
  workspace.mockResolvedValue({ projects: [] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthSessionContext.Provider
        value={{ user: { id: "user-id" } } as Session}
      >
        <MemoryRouter initialEntries={["/projects/p1/board"]}>
          <App />
        </MemoryRouter>
      </AuthSessionContext.Provider>
    </QueryClientProvider>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "返回我的项目" }),
  );
  expect(
    await screen.findByRole("heading", { name: "我的项目", level: 1 }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "任务协作看板" }),
  ).not.toBeInTheDocument();
});

it("shows current owner role in My Projects and removes public discovery/join actions", async () => {
  workspace.mockResolvedValue({
    projects: [
      { id: "p1", name: "组长项目", role: "owner" },
      { id: "p2", name: "成员项目", role: "member" },
    ],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthSessionContext.Provider
        value={{ user: { id: "user-id" } } as Session}
      >
        <MemoryRouter initialEntries={["/projects"]}>
          <App />
        </MemoryRouter>
      </AuthSessionContext.Provider>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("link", { name: /组长项目 \(owner\)/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "成员项目" })).toBeInTheDocument();
  expect(screen.queryByText("可加入的项目")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "加入项目" }),
  ).not.toBeInTheDocument();
});

it("shows an administrator all projects while My Projects stays membership-scoped", async () => {
  admin.mockResolvedValue(true);
  workspace.mockResolvedValue({ projects: [{ id: "mine", name: "我的测试项目", role: "owner" }] });
  allProjects.mockResolvedValue([{ id: "mine", name: "我的测试项目" }, { id: "other", name: "其他项目" }]);
  renderRoute("/projects");
  expect(await screen.findByRole("link", { name: /我的测试项目 \(owner\)/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "其他项目" })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("link", { name: "全部项目" }));
  expect(await screen.findByRole("link", { name: "其他项目" })).toBeInTheDocument();
  expect(allProjects).toHaveBeenCalled();
});

it("keeps the all-projects route unavailable to non-admins", async () => {
  workspace.mockResolvedValue({ projects: [] });
  renderRoute("/projects/all");
  expect(await screen.findByRole("heading", { name: "我的项目", level: 1 })).toBeInTheDocument();
  expect(allProjects).not.toHaveBeenCalled();
});

it("lets a member delete only their own task and refresh the board manually", async () => {
  project.mockResolvedValue({ id: "p1", name: "测试项目" });
  members.mockResolvedValue([]);
  tasks.mockResolvedValue([
    { id: "own", title: "本人任务", status: "todo", priority: "medium", assignee: "未分配", assigneeUserId: null, createdBy: "user-id" },
    { id: "other", title: "他人任务", status: "todo", priority: "medium", assignee: "未分配", assigneeUserId: null, createdBy: "other-id" },
  ]);
  renderRoute("/projects/p1/board");
  expect(await screen.findByRole("heading", { name: "本人任务" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /删\s*除/ })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /删\s*除/ })).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "刷新任务" }));
  expect(await screen.findByText("任务和已打开的详情已更新。" )).toBeInTheDocument();
  expect(tasks).toHaveBeenCalledTimes(2);
});

it("shows owner deletion for every task in the project", async () => {
  role.mockResolvedValue("owner");
  project.mockResolvedValue({ id: "p1", name: "测试项目" });
  members.mockResolvedValue([]);
  tasks.mockResolvedValue([{ id: "other", title: "成员任务", status: "todo", priority: "low", assignee: "未分配", assigneeUserId: null, createdBy: "other-id" }]);
  renderRoute("/projects/p1/board");
  expect(await screen.findByRole("button", { name: /删\s*除/ })).toBeInTheDocument();
});

it("shows an unjoined administrator the deletion action on a linked board", async () => {
  admin.mockResolvedValue(true);
  role.mockResolvedValue(null);
  project.mockResolvedValue({ id: "p1", name: "测试项目" });
  members.mockResolvedValue([]);
  tasks.mockResolvedValue([{ id: "other", title: "成员任务", status: "todo", priority: "low", assignee: "未分配", assigneeUserId: null, createdBy: "other-id" }]);
  renderRoute("/projects/p1/board");
  expect(await screen.findByRole("button", { name: /删\s*除/ })).toBeInTheDocument();
});

it("reports a refused deletion without showing success", async () => {
  role.mockResolvedValue("owner");
  removeTask.mockRejectedValue(new Error("permission denied"));
  project.mockResolvedValue({ id: "p1", name: "测试项目" });
  members.mockResolvedValue([]);
  tasks.mockResolvedValue([{ id: "one", title: "待删除任务", status: "todo", priority: "low", assignee: "未分配", assigneeUserId: null, createdBy: "user-id" }]);
  renderRoute("/projects/p1/board");
  await userEvent.click(await screen.findByRole("button", { name: /删\s*除/ }));
  const deleteButtons = screen.getAllByRole("button", { name: /删\s*除/ });
  await userEvent.click(deleteButtons[deleteButtons.length - 1]);
  expect(await screen.findByText("permission denied")).toBeInTheDocument();
  expect(screen.queryByText("任务已删除。")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "待删除任务" })).toBeInTheDocument();
});
