export type Task = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high"; //优先级
  assignee: string;
  assigneeUserId: string | null;
  createdBy: string;
  sortOrder?: number;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorName: string;
  content: string;
  createdAt: string;
};
