import { Button, Popconfirm, Select } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";

type TaskCardProps = {
  task: Task;
  onComplete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: Task["status"]) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onOpenDetails: (taskId: string) => void;
  isThisTaskPending: boolean;
  canDelete: boolean;
  readOnly?: boolean;
  isDraggable?: boolean;
};

export function TaskCard({ task, onComplete, onStatusChange, onEdit, onDelete, onOpenDetails, isThisTaskPending, canDelete, readOnly = false, isDraggable = false }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !isDraggable || isThisTaskPending });
  const priorityLabels = { low: "低", medium: "中", high: "高" };
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : undefined }} className={`task-card${isDragging ? " task-card--dragging" : ""}`}>
    <div className="task-card__heading">
      <h3 className="task-card__title">{task.title}</h3>
      {isDraggable && <Button ref={setActivatorNodeRef} className="task-card__drag-handle" type="text" size="small"
        icon={<HolderOutlined />} aria-label={`拖动任务：${task.title}`} title="拖动调整顺序" {...attributes} {...listeners} />}
    </div>
    <div className="task-card__info">
      <p><span className="task-card__label">优先级</span><span className={`task-card__priority task-card__priority--${task.priority}`}>{priorityLabels[task.priority]}</span></p>
      <p><span className="task-card__label">负责人</span><span>{task.assignee || "未分配"}</span></p>
      <label className="task-card__status"><span className="task-card__label">状态</span>
        <Select aria-label={`修改${task.title}状态`} size="small" value={task.status} disabled={isThisTaskPending || readOnly} onChange={(value) => onStatusChange(task.id, value)} options={[{ label: "待处理", value: "todo" }, { label: "进行中", value: "doing" }, { label: "已完成", value: "done" }]} />
      </label>
      <div className="task-card__actions">
        {!readOnly && task.status !== "done" && <Button size="small" type="primary" loading={isThisTaskPending} onClick={() => onComplete(task.id)}>完成</Button>}
        <Button size="small" onClick={() => onOpenDetails(task.id)}>评论</Button>
        {!readOnly && <Button size="small" onClick={() => onEdit(task)}>编辑</Button>}
        {canDelete && <Popconfirm title="删除这条任务？" description="相关评论也会一并删除。" okText="删除" cancelText="取消" onConfirm={() => onDelete(task.id)}>
          <Button size="small" danger loading={isThisTaskPending}>删除</Button>
        </Popconfirm>}
      </div>
    </div>
  </article>;
}
