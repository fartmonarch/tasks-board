import type { Task, TaskComment } from "../types";

let tasks: Task[] = [
  {
    id: 1,
    title: "梳理看板需求",
    status: "todo",
    priority: "high",
    assignee: "张三",
  },
  {
    id: 2,
    title: "完成静态页面",
    status: "doing",
    priority: "medium",
    assignee: "李四",
  },
  {
    id: 3,
    title: "初始化 Git 仓库",
    status: "done",
    priority: "low",
    assignee: "王五",
  },
  {
    id: 4,
    title: "编写 README",
    status: "todo",
    priority: "medium",
    assignee: "赵六",
  },
  {
    id: 5,
    title: "设计数据库结构",
    status: "doing",
    priority: "high",
    assignee: "孙七",
  },
];

let comments: TaskComment[] = [
  {
    id: 1,
    taskId: 1,
    content: "先明确看板的核心操作和使用角色。",
    createdAt: "2026-09-28T09:30:00.000Z",
  },
];

// 模拟 API 调用，更新任务状态

export async function updateTaskStatus(
  taskId: number,
  status: Task["status"],
): Promise<Task | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const updatedTasks = tasks.map((task) => {
    if (task.id === taskId) {
      return { ...task, status };
    }
    return task;
  });
  tasks = updatedTasks;
  return updatedTasks.find((task) => task.id === taskId);
}

export async function createTask(title: string): Promise<Task> {
  // 模拟请求等待
  // 创建一条 Task
  // 把它加入 tasks
  // 返回新任务
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const newTask: Task = {
    id: tasks.length + 1,
    title: title,
    status: "todo",
    priority: "medium",
    assignee: "未分配",
  };
  tasks = [...tasks, newTask];
  return newTask;
}

export async function getTasks(): Promise<Task[]> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return tasks;
}

export async function getTaskById(taskId: number): Promise<Task | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return tasks.find((task) => task.id === taskId);
}

export async function getTaskComments(taskId: number): Promise<TaskComment[]> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return comments.filter((comment) => comment.taskId === taskId);
}

export async function addTaskComment(
  taskId: number,
  content: string,
): Promise<TaskComment> {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    throw new Error("评论内容不能为空");
  }

  if (!tasks.some((task) => task.id === taskId)) {
    throw new Error("任务不存在，无法添加评论");
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  const newComment: TaskComment = {
    id: comments.length + 1,
    taskId,
    content: normalizedContent,
    createdAt: new Date().toISOString(),
  };

  comments = [...comments, newComment];
  return newComment;
}
