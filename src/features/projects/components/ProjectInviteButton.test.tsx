import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionContext } from "../../auth/AuthSessionContext";
import { ProjectInviteButton } from "./ProjectInviteButton";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), create: vi.fn() }));
vi.mock("../api/projectInvitationApi", () => ({
  canInviteToProject: mocks.permission,
  createProjectInvitation: mocks.create,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderButton() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthSessionContext.Provider
        value={{ user: { id: "user-id" } } as Session}
      >
        <ProjectInviteButton projectId="project-id" />
      </AuthSessionContext.Provider>
    </QueryClientProvider>,
  );
}
describe("ProjectInviteButton", () => {
  it("does not show an invitation action to an ordinary member", async () => {
    mocks.permission.mockResolvedValue(false);
    renderButton();
    await vi.waitFor(() => expect(mocks.permission).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: /邀请成员/ }),
    ).not.toBeInTheDocument();
  });
  it("allows an authorized user to generate once and copy the returned link", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    mocks.permission.mockResolvedValue(true);
    const link = `https://example.test/invite#token=${"ef".repeat(32)}`;
    mocks.create.mockResolvedValue({ link, expiresAt: "2026-10-05T00:00:00Z" });
    renderButton();
    await user.click(await screen.findByRole("button", { name: /邀请成员/ }));
    await user.click(
      screen.getByRole("button", { name: /生成一次性邀请链接/ }),
    );
    expect(await screen.findByLabelText("邀请链接")).toHaveValue(link);
    expect(
      screen.getByRole("button", { name: /生成一次性邀请链接/ }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /复制链接/ }));
    expect(copy).toHaveBeenCalledWith(link);
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith("project-id");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "邀请链接已复制",
    );
  });
});
