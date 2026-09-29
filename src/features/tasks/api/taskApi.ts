import type { Task, TaskComment } from "../types";

let tasks: Task[] = [
  { id: 1, title: "梳理看板需求", status: "todo", priority: "high", assignee: "张三" },
  { id: 2, title: "完成静态页面", status: "doing", priority: "medium", assignee: "李四" },
  { id: 3, title: "初始化 Git 仓库", status: "done", priority: "low", assignee: "王五" },
  { id: 4, title: "编写 README", status: "todo", priority: "medium", assignee: "赵六" },
  { id: 5, title: "设计数据库结构", status: "doing", priority: "high", assignee: "孙七" },
];
let comments: TaskComment[] = [{ id: 1, taskId: 1, content: "先明确看板的核心操作和使用角色。", createdAt: "2026-09-28T09:30:00.000Z" }];

export async function updateTask(taskId: number, changes: Partial<Pick<Task, "title" | "status" | "priority" | "assignee">>): Promise<Task> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("任务不存在");
  tasks = tasks.map((item) => item.id === taskId ? { ...item, ...changes } : item);
  return tasks.find((item) => item.id === taskId)!;
}
export async function updateTaskStatus(taskId: number, status: Task["status"]): Promise<Task> {
  return updateTask(taskId, { status });
}
export async function deleteTask(taskId: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (!tasks.some((task) => task.id === taskId)) throw new Error("任务不存在");
  tasks = tasks.filter((task) => task.id !== taskId);
  comments = comments.filter((comment) => comment.taskId !== taskId);
}
export async function createTask(title: string): Promise<Task> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const newTask: Task = { id: Math.max(0, ...tasks.map((task) => task.id)) + 1, title: title.trim(), status: "todo", priority: "medium", assignee: "未分配" };
  tasks = [...tasks, newTask];
  return newTask;
}
export async function getTasks(): Promise<Task[]> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  return [...tasks];
}
export async function getTaskById(taskId: number): Promise<Task | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return tasks.find((task) => task.id === taskId);
}
export async function getTaskComments(taskId: number): Promise<TaskComment[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return comments.filter((comment) => comment.taskId === taskId);
}
export async function addTaskComment(taskId: number, content: string): Promise<TaskComment> {
  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error("评论内容不能为空");
  if (!tasks.some((task) => task.id === taskId)) throw new Error("任务不存在，无法添加评论");
  await new Promise((resolve) => setTimeout(resolve, 200));
  const newComment: TaskComment = { id: Math.max(0, ...comments.map((comment) => comment.id)) + 1, taskId, content: normalizedContent, createdAt: new Date().toISOString() };
  comments = [...comments, newComment];
  return newComment;
}
