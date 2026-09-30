import { supabase } from "../../../lib/supabase";

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

export async function createTeam(name: string) {
  const client = requireSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("登录状态已失效，请重新登录。");

  const { data, error } = await client
    .from("teams")
    .insert({ name: name.trim(), created_by: user.id })
    .select("id, name")
    .single();
  if (error) throw error;
  const { error: membershipError } = await client
    .from("team_members")
    .insert({ team_id: data.id, user_id: user.id, role: "admin" });
  if (membershipError) throw new Error(`团队已创建，但管理员成员关系没有保存：${membershipError.message}`);
  return data;
}

export async function createProject(teamId: string, name: string) {
  const client = requireSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("登录状态已失效，请重新登录。");

  const { data: membership, error: membershipQueryError } = await client
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipQueryError) throw membershipQueryError;
  if (!membership) {
    const { error } = await client
      .from("team_members")
      .insert({ team_id: teamId, user_id: user.id, role: "admin" });
    if (error) throw error;
  }

  const { data: project, error: projectError } = await client
    .from("projects")
    .insert({ team_id: teamId, name: name.trim(), created_by: user.id })
    .select("id, team_id, name")
    .single();
  if (projectError) throw projectError;

  const { error: projectMembershipError } = await client
    .from("project_members")
    .insert({ team_id: teamId, project_id: project.id, user_id: user.id });
  if (projectMembershipError) {
    throw new Error(`项目已创建，但成员关系没有保存：${projectMembershipError.message}`);
  }
  return project as ProjectSummary;
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const client = requireSupabase();
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
  return userIds.map((userId) => ({ userId, name: names.get(userId) || userId.slice(0, 8) }));
}
