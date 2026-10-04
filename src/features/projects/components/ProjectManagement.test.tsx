import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectManagement } from "./ProjectManagement";

const actions = vi.hoisted(() => ({
  remove: vi.fn(), transfer: vi.fn(), archive: vi.fn(), delete: vi.fn(),
}));
vi.mock("../api/projectApi", () => ({
  removeProjectMember: actions.remove,
  transferProjectOwner: actions.transfer,
  setProjectArchived: actions.archive,
  deleteProjectPermanently: actions.delete,
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.values(actions).forEach((action) => action.mockReset().mockResolvedValue(undefined));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function show(isOwner: boolean, isAdmin = false, archivedAt: string | null = null) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <ProjectManagement project={{ id: "p1", name: "项目甲", archivedAt }}
        members={[{ userId: "owner", name: "组长", role: "owner" }, { userId: "member", name: "成员", role: "member" }]}
        membersPending={false} onRetryMembers={() => {}}
        isOwner={isOwner} isAdmin={isAdmin} currentUserId={isOwner ? "owner" : "member"} />
    </MemoryRouter>
  </QueryClientProvider>);
}

it("hides management actions from members", () => {
  show(false);
  expect(screen.getByText("成员与项目状态")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /移\s*除/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "归档项目" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "永久删除项目" })).not.toBeInTheDocument();
});

it("lets the owner remove a member only after confirming the history notice", async () => {
  show(true);
  await userEvent.click(screen.getByRole("button", { name: /移\s*除/ }));
  expect(screen.getByText(/任务和评论历史保留/)).toBeInTheDocument();
  const removeButtons = screen.getAllByRole("button", { name: /移\s*除/ });
  await userEvent.click(removeButtons[removeButtons.length - 1]);
  expect(actions.remove).toHaveBeenCalledWith("p1", "member");
});

it("requires typing the project name before permanent deletion", async () => {
  show(false, true);
  await userEvent.click(screen.getByRole("button", { name: "永久删除项目" }));
  expect(screen.getByText(/任务、评论会一并永久删除/)).toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: "永久删除" });
  expect(confirm).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox", { name: "输入项目名称以确认" }), "项目甲");
  expect(confirm).toBeEnabled();
  await userEvent.click(confirm);
  expect(actions.delete).toHaveBeenCalledWith("p1");
});

it("confirms ownership transfer to an existing member", async () => {
  show(true);
  await userEvent.click(screen.getByRole("button", { name: "转让组长" }));
  expect(screen.getByText(/唯一组长/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认转让" }));
  expect(actions.transfer).toHaveBeenCalledWith("p1", "member");
});

it("offers restoration for archived projects to an admin", async () => {
  show(false, true, "2026-10-04T00:00:00Z");
  expect(screen.getByText("已归档")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "恢复项目" }));
  const restoreButtons = screen.getAllByRole("button", { name: /恢\s*复/ });
  await userEvent.click(restoreButtons[restoreButtons.length - 1]);
  expect(actions.archive).toHaveBeenCalledWith("p1", false);
});
