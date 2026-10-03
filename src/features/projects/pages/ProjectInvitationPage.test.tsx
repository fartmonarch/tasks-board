import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionContext } from "../../auth/AuthSessionContext";
import { ProjectInvitationPage } from "./ProjectInvitationPage";

const { redeem } = vi.hoisted(() => ({ redeem: vi.fn() }));
vi.mock("../api/projectInvitationApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/projectInvitationApi")>()),
  redeemProjectInvitation: redeem,
}));
const token = "ab".repeat(32);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderInvite(hash: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionContext.Provider
        value={
          { user: { id: "user-id", email: "member@example.test" } } as Session
        }
      >
        <MemoryRouter initialEntries={[`/invite${hash}`]}>
          <Routes>
            <Route path="/invite" element={<ProjectInvitationPage />} />
            <Route
              path="/projects/project-id/board"
              element={<h1>目标项目看板</h1>}
            />
          </Routes>
        </MemoryRouter>
      </AuthSessionContext.Provider>
    </QueryClientProvider>,
  );
  return invalidate;
}

describe("ProjectInvitationPage", () => {
  it("redeems after account confirmation, refreshes My Projects and enters the board", async () => {
    redeem.mockResolvedValue("project-id");
    const invalidate = renderInvite(`#token=${token}`);
    expect(redeem).not.toHaveBeenCalled();
    expect(screen.getByText(/member@example.test/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /接受邀请并进入项目/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "目标项目看板" }),
    ).toBeInTheDocument();
    expect(redeem).toHaveBeenCalledExactlyOnceWith(token);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["workspace", "projects", "user-id"],
    });
  });
  it("shows a generic rejection and stays on the invitation page", async () => {
    redeem.mockRejectedValue(new Error("邀请无效、已过期或已被使用"));
    renderInvite(`#token=${token}`);
    await userEvent.click(
      screen.getByRole("button", { name: /接受邀请并进入项目/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("邀请无效、已过期或已被使用"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "目标项目看板" }),
    ).not.toBeInTheDocument();
  });
  it("does not offer redemption for an incomplete credential", () => {
    renderInvite("#token=bad");
    expect(screen.getByText(/邀请链接无效/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /接受邀请/ }),
    ).not.toBeInTheDocument();
    expect(redeem).not.toHaveBeenCalled();
  });
});
