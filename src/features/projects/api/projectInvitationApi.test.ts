/// <reference types="node" />
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canInviteToProject,
  createProjectInvitation,
  readInvitationToken,
  redeemProjectInvitation,
} from "./projectInvitationApi";

const { rpc, single } = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn() }));
vi.mock("../../../lib/supabase", () => ({ supabase: { rpc } }));
const token = "ab".repeat(32);

describe("project invitation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", webcrypto);
    rpc.mockReturnValue({ single });
  });
  it("uses a fragment, not query parameters or a project ID as the credential", async () => {
    single.mockResolvedValue({
      data: { token, expires_at: "2026-10-05T00:00:00Z" },
      error: null,
    });
    const invitation = await createProjectInvitation("project-id");
    const url = new URL(invitation.link);
    expect(url.pathname).toBe("/invite");
    expect(url.search).toBe("");
    expect(readInvitationToken(url.hash)).toBe(token);
    expect(invitation.link).not.toContain("project-id");
    expect(rpc).toHaveBeenCalledWith("create_project_invitation_with_mode", {
      target_project_id: "project-id",
      invitation_mode: "single",
    });
  });
  it("passes the fixed group mode to the database", async () => {
    single.mockResolvedValue({
      data: { token, expires_at: "2026-10-04T01:00:00Z" },
      error: null,
    });
    expect((await createProjectInvitation("project-id", "group")).mode).toBe(
      "group",
    );
    expect(rpc).toHaveBeenCalledWith("create_project_invitation_with_mode", {
      target_project_id: "project-id",
      invitation_mode: "group",
    });
  });
  it.each(["PGRST202", "42883"])(
    "explains unavailable invitation services without exposing SDK errors (%s)",
    async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: token } });
      await expect(canInviteToProject("project-id")).rejects.toThrow(
        "邀请功能暂不可用",
      );
      rpc.mockReturnValue({ single });
      single.mockResolvedValue({ data: null, error: { code, message: token } });
      await expect(createProjectInvitation("project-id")).rejects.toThrow(
        "邀请功能暂不可用",
      );
      await expect(redeemProjectInvitation(token)).rejects.toThrow(
        "邀请功能暂不可用",
      );
    },
  );
  it("sends only SHA-256 to the redemption RPC", async () => {
    single.mockResolvedValue({
      data: { project_id: "project-id" },
      error: null,
    });
    expect(await redeemProjectInvitation(token)).toBe("project-id");
    const expected = Buffer.from(
      await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ).toString("hex");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("redeem_project_invitation", {
      invite_hash: expected,
    });
    expect(expected).not.toBe(token);
  });
  it.each(["", "#token=project-id", "#token=abc", `#token=${"z".repeat(64)}`])(
    "rejects malformed fragments (%s)",
    (hash) => {
      expect(readInvitationToken(hash)).toBeNull();
    },
  );
  it("rejects malformed input before making a request", async () => {
    await expect(redeemProjectInvitation("invalid")).rejects.toThrow(
      "邀请链接无效",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not reflect server errors or secrets in a displayed error", async () => {
    single.mockResolvedValue({ data: null, error: { message: token } });
    await expect(redeemProjectInvitation(token)).rejects.toThrow(
      "邀请无效、已过期或已被使用",
    );
  });
  it("uses the database permission result", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await canInviteToProject("project-id")).toBe(false);
    expect(rpc).toHaveBeenCalledWith("can_invite_to_project", {
      target_project_id: "project-id",
    });
  });
});
