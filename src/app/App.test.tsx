import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { AuthSessionContext } from "../features/auth/AuthSessionContext";
import App from "./App";

const { workspace } = vi.hoisted(() => ({ workspace: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../features/projects/api/projectApi", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../features/projects/api/projectApi")
  >()),
  getWorkspace: workspace,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
