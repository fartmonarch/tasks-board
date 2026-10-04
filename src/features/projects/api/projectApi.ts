import { supabase } from "../../../lib/supabase";
import { ensureCurrentProfile } from "../../auth/profileApi";

export type ProjectSummary = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export type MyProject = ProjectSummary & { role: "owner" | "member" };

export type ProjectMember = {
  userId: string;
  name: string;
  role: "owner" | "member";
};

function mapProject(project: { id: string; name: string; archived_at: string | null }): ProjectSummary {
  return { id: project.id, name: project.name, archivedAt: project.archived_at };
}

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
    .select("id, name, archived_at")
    .in("id", projectIds)
    .order("name");
  if (projectsResult.error) throw projectsResult.error;
  const roles = new Map((membershipsResult.data ?? []).map((membership) => [membership.project_id, membership.role]));
  return { projects: (projectsResult.data ?? []).map((project) => ({
    ...mapProject(project), role: roles.get(project.id) as MyProject["role"],
  })) as MyProject[] };
}

export async function getCurrentUserIsSystemAdmin(): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("current_user_is_system_admin");
  if (error) throw error;
  return data === true;
}

export async function getCurrentProjectRole(
  projectId: string,
  userId: string,
): Promise<MyProject["role"] | null> {
  const { data, error } = await requireSupabase()
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as MyProject["role"] | undefined) ?? null;
}

export async function getAllProjects(): Promise<ProjectSummary[]> {
  const client = requireSupabase();
  const { data: isAdmin, error: adminError } = await client.rpc("current_user_is_system_admin");
  if (adminError) throw adminError;
  if (isAdmin !== true) throw new Error("只有系统管理员可以查看全部项目。");
  const { data, error } = await client.from("projects").select("id, name, archived_at").order("name");
  if (error) throw error;
  return (data ?? []).map(mapProject);
}

export async function getProjectById(projectId: string): Promise<ProjectSummary> {
  const { data, error } = await requireSupabase()
    .from("projects")
    .select("id, name, archived_at")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return mapProject(data);
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
  const project = data as { id: string; name: string };
  return { id: project.id, name: project.name, archivedAt: null };
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const client = requireSupabase();
  await ensureCurrentProfile();

  const { data: projectMembers, error } = await client
    .from("project_members")
    .select("user_id, role")
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
  return (projectMembers ?? []).map((member) => ({
    userId: member.user_id,
    name: names.get(member.user_id) || "未设置姓名",
    role: member.role as ProjectMember["role"],
  }));
}

async function runProjectAction(name: string, args: Record<string, string | boolean>) {
  const { error } = await requireSupabase().rpc(name, args);
  if (error) throw error;
}

export const removeProjectMember = (projectId: string, userId: string) =>
  runProjectAction("remove_project_member", { target_project_id: projectId, target_user_id: userId });

export const transferProjectOwner = (projectId: string, userId: string) =>
  runProjectAction("transfer_project_owner", { target_project_id: projectId, target_user_id: userId });

export const setProjectArchived = (projectId: string, archived: boolean) =>
  runProjectAction("set_project_archived", { target_project_id: projectId, should_archive: archived });

export const deleteProjectPermanently = (projectId: string) =>
  runProjectAction("delete_project_permanently", { target_project_id: projectId });
