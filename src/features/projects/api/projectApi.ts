import { supabase } from "../../../lib/supabase";
import { ensureCurrentProfile } from "../../auth/profileApi";

export type ProjectSummary = {
  id: string;
  name: string;
};

export type MyProject = ProjectSummary & { role: "owner" | "member" };

export type ProjectMember = {
  userId: string;
  name: string;
};

function requireSupabase() {
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  return supabase;
}

export async function getWorkspace() {
  const client = requireSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("登录状态已失效，请重新登录。");

  const membershipsResult = await client
    .from("project_members")
    .select("project_id, role")
    .eq("user_id", user.id);
  if (membershipsResult.error) throw membershipsResult.error;
  const projectIds = (membershipsResult.data ?? []).map((membership) => membership.project_id);
  if (projectIds.length === 0) return { projects: [] as MyProject[] };

  const projectsResult = await client
    .from("projects")
    .select("id, name")
    .in("id", projectIds)
    .order("name");
  if (projectsResult.error) throw projectsResult.error;
  const roles = new Map((membershipsResult.data ?? []).map((membership) => [membership.project_id, membership.role]));
  return { projects: (projectsResult.data ?? []).map((project) => ({
    ...project, role: roles.get(project.id) as MyProject["role"],
  })) as MyProject[] };
}

export async function getProjectById(projectId: string): Promise<ProjectSummary> {
  const { data, error } = await requireSupabase()
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return data as ProjectSummary;
}

export async function createProject(name: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .rpc("create_project", { project_name: name.trim() })
    .single();
  if (error?.code === "23505") {
    throw new Error("已存在同名项目，请换一个名称。项目名不区分大小写。");
  }
  if (error) throw error;
  return data as ProjectSummary;
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const client = requireSupabase();
  await ensureCurrentProfile();

  const { data: projectMembers, error } = await client
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);
  if (error) throw error;
  const userIds = [...new Set((projectMembers ?? []).map((member) => member.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  if (profilesError) throw profilesError;
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  return userIds.map((userId) => ({ userId, name: names.get(userId) || "未设置姓名" }));
}
