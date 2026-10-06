import { supabase } from "../../../lib/supabase";
import { ensureCurrentProfile } from "../../auth/profileApi";
import type { Task, TaskComment } from "../types";

type TaskRow = {
  id: string;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  assignee_user_id: string | null;
  created_by: string;
  sort_order: number;
};

function requireSupabase() {
  if (!supabase) throw new Error("请先配置 Supabase 环境变量并登录。");
  return supabase;
}

async function mapTasks(rows: TaskRow[]): Promise<Task[]> {
  await ensureCurrentProfile();
  const assigneeIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.assignee_user_id ? [row.assignee_user_id] : [],
      ),
    ),
  ];
  const profiles = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data, error } = await requireSupabase()
      .from("profiles")
      .select("id, display_name")
      .in("id", assigneeIds);
    if (error) throw error;
    for (const profile of data ?? [])
      profiles.set(profile.id, profile.display_name || "未设置姓名");
  }
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    assigneeUserId: row.assignee_user_id,
    createdBy: row.created_by,
    assignee: row.assignee_user_id
      ? (profiles.get(row.assignee_user_id) ?? "未设置姓名")
      : "未分配",
    sortOrder: row.sort_order,
  }));
}

async function getNextSortOrder(
  projectId: string,
  status: Task["status"],
): Promise<number> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .eq("status", status)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.sort_order ?? -1) + 1;
}

export async function getTasks(projectId: string): Promise<Task[]> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .select(
      "id, title, status, priority, assignee_user_id, created_by, sort_order",
    )
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return mapTasks((data ?? []) as TaskRow[]);
}

export async function getTaskById(
  projectId: string,
  taskId: string,
): Promise<Task | undefined> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .select(
      "id, title, status, priority, assignee_user_id, created_by, sort_order",
    )
    .eq("project_id", projectId)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return (await mapTasks([data as TaskRow]))[0];
}

export async function createTask(
  projectId: string,
  title: string,
  createdBy: string,
): Promise<Task> {
  const sortOrder = await getNextSortOrder(projectId, "todo");
  const { data, error } = await requireSupabase()
    .from("tasks")
    .insert({
      project_id: projectId,
      title: title.trim(),
      created_by: createdBy,
      sort_order: sortOrder,
    })
    .select(
      "id, title, status, priority, assignee_user_id, created_by, sort_order",
    )
    .single();
  if (error) throw error;
  return (await mapTasks([data as TaskRow]))[0];
}

export async function updateTask(
  projectId: string,
  taskId: string,
  changes: Partial<
    Pick<Task, "title" | "status" | "priority" | "assigneeUserId">
  >,
): Promise<Task> {
  const sortOrder =
    changes.status === undefined
      ? undefined
      : await getNextSortOrder(projectId, changes.status);
  const { data, error } = await requireSupabase()
    .from("tasks")
    .update({
      ...(changes.title === undefined ? {} : { title: changes.title.trim() }),
      ...(changes.status === undefined ? {} : { status: changes.status }),
      ...(changes.priority === undefined ? {} : { priority: changes.priority }),
      ...(changes.assigneeUserId === undefined
        ? {}
        : { assignee_user_id: changes.assigneeUserId }),
      ...(sortOrder === undefined ? {} : { sort_order: sortOrder }),
    })
    .eq("project_id", projectId)
    .eq("id", taskId)
    .select(
      "id, title, status, priority, assignee_user_id, created_by, sort_order",
    )
    .single();
  if (error) throw error;
  return (await mapTasks([data as TaskRow]))[0];
}

export async function persistTaskOrder(
  projectId: string,
  orderedTasks: Array<Pick<Task, "id" | "status">>,
): Promise<void> {
  const { error } = await requireSupabase().rpc("reorder_project_tasks", {
    target_project_id: projectId,
    target_task_ids: orderedTasks.map((task) => task.id),
    target_statuses: orderedTasks.map((task) => task.status),
  });
  if (error) throw error;
}

export async function deleteTask(
  projectId: string,
  taskId: string,
): Promise<void> {
  const { data, error } = await requireSupabase()
    .from("tasks")
    .delete()
    .eq("project_id", projectId)
    .eq("id", taskId)
    .select("id");
  if (error) throw error;
  if (data?.length !== 1) {
    throw new Error(
      "任务未删除，可能已被其他成员删除或当前账号没有权限。请刷新后重试。",
    );
  }
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await requireSupabase()
    .from("comments")
    .select("id, task_id, author_id, content, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const authorIds = [
    ...new Set(
      (data ?? []).flatMap((comment) =>
        comment.author_id ? [comment.author_id] : [],
      ),
    ),
  ];
  const authorNames = new Map<string, string>();
  if (authorIds.length) {
    const { data: profiles, error: profilesError } = await requireSupabase()
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);
    if (profilesError) throw profilesError;
    for (const profile of profiles ?? [])
      authorNames.set(profile.id, profile.display_name || "未设置姓名");
  }
  return (data ?? []).map((comment) => ({
    id: comment.id,
    taskId: comment.task_id,
    authorName: comment.author_id
      ? (authorNames.get(comment.author_id) ?? "未设置姓名")
      : "已注销用户",
    content: comment.content,
    createdAt: comment.created_at,
  }));
}

export async function addTaskComment(
  taskId: string,
  content: string,
  authorId: string,
  authorName: string,
): Promise<TaskComment> {
  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error("评论内容不能为空");
  const { data, error } = await requireSupabase()
    .from("comments")
    .insert({
      task_id: taskId,
      author_id: authorId,
      content: normalizedContent,
    })
    .select("id, task_id, author_id, content, created_at")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    taskId: data.task_id,
    authorName: authorName || "未设置姓名",
    content: data.content,
    createdAt: data.created_at,
  };
}
