import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task } from "../types";

type Props = {
  status: Task["status"];
  title: string;
  tasks: Task[];
  children: ReactNode;
};

export function TaskBoardColumn({ status, title, tasks, children }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={`kanban-column kanban-column--${status}${isOver ? " kanban-column--over" : ""}`}
      aria-label={title}
    >
      <div className="kanban-column__header">
        <h2>{title}</h2>
        <span>{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {tasks.length === 0 && <p className="kanban-empty">拖动任务到这里</p>}
    </section>
  );
}
import type { ReactNode } from "react";
