export type Task = {
  id: number;
  title: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high"; //优先级
  assignee: string;
};

export type TaskComment = {
  id: number;
  taskId: number;
  content: string;
  createdAt: string;
};
