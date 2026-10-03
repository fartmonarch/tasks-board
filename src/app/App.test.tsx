import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { AuthSessionContext } from "../features/auth/AuthSessionContext";
import App from "./App";

const { workspace, project, members, tasks } = vi.hoisted(() => ({
  workspace: vi.fn(),
  project: vi.fn(),
  members: vi.fn(),
  tasks: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../features/projects/api/projectApi", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../features/projects/api/projectApi")
  >()),
  getWorkspace: workspace,
  getProjectById: project,
  getProjectMembers: members,
}));
vi.mock("../features/tasks/api/taskApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/tasks/api/taskApi")>()),
  getTasks: tasks,
}));
vi.mock("../features/projects/components/ProjectInviteButton", () => ({
  ProjectInviteButton: () => null,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
    await screen.findByRole("heading", { name: "我的项目" }),
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
