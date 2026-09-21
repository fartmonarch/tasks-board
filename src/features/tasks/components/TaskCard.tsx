import type { Task } from "../types";
type TaskCardProps = {
  task: Task;
};

export function TaskCard({ task }: TaskCardProps) {
  return (
    <article className="task-card">
      <h3 className="task-card__title">{task.title}</h3>
      <div className="task-card__info">
        <p>
          <span className="task-card__label">优先级</span>
          <span>{task.priority}</span>
        </p>
        <p>
          <span className="task-card__label">负责人</span>
          <span>{task.assignee}</span>
        </p>
      </div>
    </article>
  );
}
