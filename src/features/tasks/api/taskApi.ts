import { supabase } from "../../../lib/supabase";
import { ensureCurrentProfile } from "../../auth/profileApi";
import type { Task, TaskComment } from "../types";

type TaskRow = {
  id: string;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  assignee_user_id: string | null;
};

function requireSupabase() {
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  return supabase;
}

async function requireUserId() {
  const { data: { user }, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("登录状态已失效，请重新登录。");
  return user.id;
}

async function mapTasks(rows: TaskRow[]): Promise<Task[]> {
  await ensureCurrentProfile();
  const assigneeIds = [...new Set(rows.flatMap((row) => row.assignee_user_id ? [row.assignee_user_id] : []))];
  const profiles = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data, error } = await requireSupabase().from("profiles").select("id, display_name").in("id", assigneeIds);
    if (error) throw error;
    for (const profile of data ?? []) profiles.set(profile.id, profile.display_name || "未设置姓名");
  }
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    assigneeUserId: row.assignee_user_id,
    assignee: row.assignee_user_id ? profiles.get(row.assignee_user_id) ?? "未设置姓名" : "未分配",
  }));
}

export async function getTasks(projectId: string): Promise<Task[]> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .select("id, title, status, priority, assignee_user_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return mapTasks((data ?? []) as TaskRow[]);
}

export async function getTaskById(projectId: string, taskId: string): Promise<Task | undefined> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .select("id, title, status, priority, assignee_user_id")
    .eq("project_id", projectId)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return (await mapTasks([data as TaskRow]))[0];
}

export async function createTask(projectId: string, title: string): Promise<Task> {
  const userId = await requireUserId();
  const { data, error } = await requireSupabase()
    .from("tasks")
    .insert({ project_id: projectId, title: title.trim(), created_by: userId })
    .select("id, title, status, priority, assignee_user_id")
    .single();
  if (error) throw error;
  return (await mapTasks([data as TaskRow]))[0];
}

export async function updateTask(
  projectId: string,
  taskId: string,
  changes: Partial<Pick<Task, "title" | "status" | "priority" | "assigneeUserId">>,
): Promise<Task> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .update({
      ...(changes.title === undefined ? {} : { title: changes.title.trim() }),
      ...(changes.status === undefined ? {} : { status: changes.status }),
      ...(changes.priority === undefined ? {} : { priority: changes.priority }),
      ...(changes.assigneeUserId === undefined ? {} : { assignee_user_id: changes.assigneeUserId }),
    })
    .eq("project_id", projectId)
    .eq("id", taskId)
    .select("id, title, status, priority, assignee_user_id")
    .single();
  if (error) throw error;
  return (await mapTasks([data as TaskRow]))[0];
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  const { error } = await requireSupabase().from("tasks").delete().eq("project_id", projectId).eq("id", taskId);
  if (error) throw error;
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await requireSupabase()
    .from("comments")
    .select("id, task_id, content, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((comment) => ({ id: comment.id, taskId: comment.task_id, content: comment.content, createdAt: comment.created_at }));
}

export async function addTaskComment(taskId: string, content: string): Promise<TaskComment> {
  const authorId = await requireUserId();
  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error("评论内容不能为空");
  const { data, error } = await requireSupabase()
    .from("comments")
    .insert({ task_id: taskId, author_id: authorId, content: normalizedContent })
    .select("id, task_id, content, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, taskId: data.task_id, content: data.content, createdAt: data.created_at };
}
