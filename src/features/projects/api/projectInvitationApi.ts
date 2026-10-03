import { supabase } from "../../../lib/supabase";

export type InvitationMode = "single" | "group";

function invitationError(error: { code?: string }, fallback: string) {
  return new Error(
    error.code === "PGRST202" || error.code === "42883"
      ? "邀请功能暂不可用，请联系项目维护者启用后重试。"
      : fallback,
  );
}

function requireSupabase() {
  if (!supabase) throw new Error("请先配置 Supabase 并登录。");
  return supabase;
}

export async function canInviteToProject(projectId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("can_invite_to_project", {
    target_project_id: projectId,
  });
  if (error) throw invitationError(error, "无法确认邀请权限，请重试。");
  return data === true;
}

export async function createProjectInvitation(
  projectId: string,
  mode: InvitationMode = "single",
) {
  const { data, error } = await requireSupabase()
    .rpc("create_project_invitation_with_mode", {
      target_project_id: projectId,
      invitation_mode: mode,
    })
    .single();
  if (error)
    throw invitationError(
      error,
      "无法生成邀请，请确认你是项目组长或系统管理员后重试。",
    );
  const invitation = data as { token: string; expires_at: string };
  const link = new URL("/invite", window.location.origin);
  link.hash = new URLSearchParams({ token: invitation.token }).toString();
  return { link: link.toString(), expiresAt: invitation.expires_at, mode };
}

export function readInvitationToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null;
}

export async function redeemProjectInvitation(token: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("邀请链接无效。");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const { data, error } = await requireSupabase()
    .rpc("redeem_project_invitation", { invite_hash: hash })
    .single();
  // Do not expose SDK errors, request bodies or invitation secrets to UI/logs.
  if (error)
    throw invitationError(
      error,
      "邀请无效、已过期或已被使用，请联系项目组长获取新链接。",
    );
  return (data as { project_id: string }).project_id;
}
