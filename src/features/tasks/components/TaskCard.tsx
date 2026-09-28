import type { Task } from "../types";
type TaskCardProps = {
  task: Task;
  onComplete: (taskId: number) => void;
  isThisTaskPending: boolean;
  isMutationPending: boolean;
};

export function TaskCard({
  task,
  onComplete,
  isThisTaskPending,
  isMutationPending,
}: TaskCardProps) {
  const priorityLabels = {
    low: "低",
    medium: "中",
    high: "高",
  };
  const isDone = task.status === "done";
  const canShow = !isDone;

  return (
    <article className="task-card">
      <h3 className="task-card__title">{task.title}</h3>
      <div className="task-card__info">
        <p>
          <span className="task-card__label">优先级</span>
          <span
            className={`task-card__priority task-card__priority--${task.priority}`}
          >
            {priorityLabels[task.priority]}
          </span>
        </p>
        <p>
          <span className="task-card__label">负责人</span>
          <span>{task.assignee}</span>
        </p>
        <p>
          <span className="task-card__label">状态</span>
          <span>
            {task.status === "todo"
              ? "待处理"
              : task.status === "doing"
                ? "进行中"
                : "已完成"}
          </span>
        </p>
        <button
          style={{
            visibility: canShow ? "visible" : "hidden",
          }}
          disabled={isMutationPending}
          onClick={() => onComplete(task.id)}
        >
          {isThisTaskPending ? "处理中..." : "完成"}
        </button>
      </div>
    </article>
  );
}
