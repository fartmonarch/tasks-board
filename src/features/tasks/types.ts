export type Task = {
  id: number;
  title: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high"; //优先级
  assignee: string; //负责人
};

export type TaskComment = {
  id: number;
  taskId: number;
  content: string;
  createdAt: string;
};
