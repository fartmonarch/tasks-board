import { Button, Popconfirm, Select } from "antd";
import type { Task } from "../types";

type TaskCardProps = {
  task: Task;
  onComplete: (taskId: number) => void;
  onStatusChange: (taskId: number, status: Task["status"]) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onOpenDetails: (taskId: number) => void;
  isThisTaskPending: boolean;
};

export function TaskCard({ task, onComplete, onStatusChange, onEdit, onDelete, onOpenDetails, isThisTaskPending }: TaskCardProps) {
  const priorityLabels = { low: "低", medium: "中", high: "高" };
  return <article className="task-card">
    <h3 className="task-card__title">{task.title}</h3>
    <div className="task-card__info">
      <p><span className="task-card__label">优先级</span><span className={`task-card__priority task-card__priority--${task.priority}`}>{priorityLabels[task.priority]}</span></p>
      <p><span className="task-card__label">负责人</span><span>{task.assignee || "未分配"}</span></p>
      <label className="task-card__status"><span className="task-card__label">状态</span>
        <Select aria-label={`修改${task.title}状态`} size="small" value={task.status} disabled={isThisTaskPending} onChange={(value) => onStatusChange(task.id, value)} options={[{ label: "待处理", value: "todo" }, { label: "进行中", value: "doing" }, { label: "已完成", value: "done" }]} />
      </label>
      <div className="task-card__actions">
        {task.status !== "done" && <Button size="small" type="primary" loading={isThisTaskPending} onClick={() => onComplete(task.id)}>完成</Button>}
        <Button size="small" onClick={() => onOpenDetails(task.id)}>评论</Button>
        <Button size="small" onClick={() => onEdit(task)}>编辑</Button>
        <Popconfirm title="删除这条任务？" description="相关评论也会一并删除。" okText="删除" cancelText="取消" onConfirm={() => onDelete(task.id)}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      </div>
    </div>
  </article>;
}
