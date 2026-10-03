import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import { ProjectInvitationPage } from "../projects/pages/ProjectInvitationPage";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signIn: vi.fn(),
  redeem: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signInWithPassword: mocks.signIn,
    },
  },
}));
vi.mock("../projects/api/projectInvitationApi", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../projects/api/projectInvitationApi")
  >()),
  redeemProjectInvitation: mocks.redeem,
}));
vi.mock("../../app/App", () => ({
  default: () => (
    <Routes>
      <Route path="/invite" element={<ProjectInvitationPage />} />
      <Route
        path="/projects/project-id/board"
        element={<h1>邀请项目看板</h1>}
      />
    </Routes>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("invitation login continuation", () => {
  it("keeps the fragment through password login and redeems only after confirmation", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const session = {
      user: { id: "user-id", email: "member@example.test" },
    } as Session;
    let authChanged: (_event: string, nextSession: Session) => void;
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      authChanged = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.signIn.mockImplementation(async () => {
      authChanged("SIGNED_IN", session);
      return { error: null };
    });
    mocks.redeem.mockResolvedValue("project-id");
    const token = "cd".repeat(32);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[`/invite#token=${token}`]}>
          <AuthGate />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/登录后将继续当前邀请/)).toBeInTheDocument();
    expect(mocks.redeem).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("邮箱"), "member@example.test");
    await userEvent.type(screen.getByLabelText("密码"), "test-password");
    await userEvent.click(screen.getByRole("button", { name: /^登\s*录$/ }));
    const accept = await screen.findByRole("button", {
      name: /接受邀请并进入项目/,
    });
    expect(mocks.redeem).not.toHaveBeenCalled();
    await userEvent.click(accept);
    expect(
      await screen.findByRole("heading", { name: "邀请项目看板" }),
    ).toBeInTheDocument();
    expect(mocks.redeem).toHaveBeenCalledExactlyOnceWith(token);
  });
});
