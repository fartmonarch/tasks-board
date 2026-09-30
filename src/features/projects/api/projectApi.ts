import { supabase } from "../../../lib/supabase";
import { ensureCurrentProfile } from "../../auth/profileApi";

export type TeamSummary = {
  id: string;
  name: string;
  role: "admin" | "member";
};

export type ProjectSummary = {
  id: string;
  team_id: string;
  name: string;
};

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

  const [teamsResult, membershipsResult, projectsResult] = await Promise.all([
    client.from("teams").select("id, name, created_by").order("created_at"),
    client.from("team_members").select("team_id, role").eq("user_id", user.id),
    client.from("projects").select("id, team_id, name").order("created_at", { ascending: false }),
  ]);
  if (teamsResult.error) throw teamsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (projectsResult.error) throw projectsResult.error;

  const roles = new Map((membershipsResult.data ?? []).map((membership) => [membership.team_id, membership.role]));
  const teams: TeamSummary[] = (teamsResult.data ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    role: team.created_by === user.id ? "admin" : (roles.get(team.id) as TeamSummary["role"] ?? "member"),
  }));
  return { teams, projects: (projectsResult.data ?? []) as ProjectSummary[] };
}

export async function getProjectById(projectId: string): Promise<ProjectSummary> {
  const { data, error } = await requireSupabase()
    .from("projects")
    .select("id, team_id, name")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return data as ProjectSummary;
}

export async function createTeam(name: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_team", { team_name: name.trim() }).single();
  if (error) throw error;
  return data;
}

export async function createProject(teamId: string, name: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .rpc("create_project", { target_team_id: teamId, project_name: name.trim() })
    .single();
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
