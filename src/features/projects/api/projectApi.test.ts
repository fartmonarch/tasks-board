import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAllProjects, getCurrentUserIsSystemAdmin, getWorkspace } from "./projectApi";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  membershipSelect: vi.fn(),
  membershipEq: vi.fn(),
  projectSelect: vi.fn(),
  projectIn: vi.fn(),
  projectOrder: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../../../lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, auth: { getUser: mocks.getUser } },
}));

describe("My Projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "admin-id" } },
      error: null,
    });
    mocks.from.mockImplementation((name) =>
      name === "project_members"
        ? { select: mocks.membershipSelect }
        : { select: mocks.projectSelect },
    );
    mocks.membershipSelect.mockReturnValue({ eq: mocks.membershipEq });
    mocks.projectSelect.mockReturnValue({ in: mocks.projectIn });
    mocks.projectIn.mockReturnValue({ order: mocks.projectOrder });
  });
  it("restricts even an admin's My Projects query to own memberships and keeps current roles", async () => {
    mocks.membershipEq.mockResolvedValue({
      data: [
        { project_id: "mine", role: "owner" },
        { project_id: "joined", role: "member" },
      ],
      error: null,
    });
    mocks.projectOrder.mockResolvedValue({
      data: [
        { id: "mine", name: "Created" },
        { id: "joined", name: "Joined" },
      ],
      error: null,
    });
    expect(await getWorkspace()).toEqual({
      projects: [
        { id: "mine", name: "Created", role: "owner" },
        { id: "joined", name: "Joined", role: "member" },
      ],
    });
    expect(mocks.membershipEq).toHaveBeenCalledWith("user_id", "admin-id");
    expect(mocks.projectIn).toHaveBeenCalledWith("id", ["mine", "joined"]);
  });
  it("does not request a project list for a user with no memberships", async () => {
    mocks.membershipEq.mockResolvedValue({ data: [], error: null });
    expect(await getWorkspace()).toEqual({ projects: [] });
    expect(mocks.from).not.toHaveBeenCalledWith("projects");
  });
});

describe("administrator project access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.projectSelect });
    mocks.projectSelect.mockReturnValue({ order: mocks.projectOrder });
  });

  it("returns only the caller's admin status", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await getCurrentUserIsSystemAdmin()).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("current_user_is_system_admin");
  });

  it("does not query all projects for a non-admin", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(getAllProjects()).rejects.toThrow("只有系统管理员");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("lists all RLS-visible projects for an administrator", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.projectOrder.mockResolvedValue({ data: [{ id: "other", name: "其他项目" }], error: null });
    expect(await getAllProjects()).toEqual([{ id: "other", name: "其他项目" }]);
    expect(mocks.from).toHaveBeenCalledWith("projects");
  });
});
