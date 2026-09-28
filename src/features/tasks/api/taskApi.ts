import type { Task } from "../types";

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
