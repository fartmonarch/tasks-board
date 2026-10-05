import { memo } from "react";
import { Button, Popconfirm, Tooltip } from "antd";
import {
  CheckOutlined,
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";

type TaskCardProps = {
  task: Task;
  onComplete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onOpenDetails: (taskId: string) => void;
  isThisTaskPending: boolean;
  canDelete: boolean;
  readOnly?: boolean;
  isDraggable?: boolean;
};

export const TaskCard = memo(function TaskCard({ task, onComplete, onEdit, onDelete, onOpenDetails, isThisTaskPending, canDelete, readOnly = false, isDraggable = false }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !isDraggable || isThisTaskPending });
  const priorityLabels = { low: "低", medium: "中", high: "高" };
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.08 : undefined }}
      className={`task-card${isDragging ? " task-card--dragging" : ""}`}
    >
      <div className="task-card__heading">
        <h3 className="task-card__title">{task.title}</h3>
        {isDraggable && (
          <Tooltip title="拖动排序">
            <Button
              ref={setActivatorNodeRef}
              className="task-card__drag-handle"
              type="text"
              size="small"
              icon={<HolderOutlined />}
              aria-label={`拖动任务：${task.title}`}
              {...attributes}
              {...listeners}
            />
          </Tooltip>
        )}
      </div>
      <div className="task-card__meta">
        <span className={`task-card__priority task-card__priority--${task.priority}`}>
          {priorityLabels[task.priority]}优先级
        </span>
        <span className="task-card__assignee" title={task.assignee || "未分配负责人"}>
          <UserOutlined aria-hidden="true" />
          <span className="task-card__assignee-name">{task.assignee || "未分配"}</span>
        </span>
      </div>
      <div className="task-card__footer">
        <span className={`task-card__status-label task-card__status-label--${task.status}`}>
          {task.status === "todo" ? "待处理" : task.status === "doing" ? "进行中" : "已完成"}
        </span>
        <div className="task-card__actions" aria-label="任务操作">
          {!readOnly && task.status !== "done" && (
            <Tooltip title="标记为完成">
              <Button
                className="task-card__action task-card__action--complete"
                size="small"
                type="primary"
                shape="circle"
                icon={<CheckOutlined />}
                aria-label={`完成任务：${task.title}`}
                loading={isThisTaskPending}
                onClick={() => onComplete(task.id)}
              />
            </Tooltip>
          )}
          <Tooltip title="查看评论">
            <Button
              className="task-card__action"
              size="small"
              shape="circle"
              icon={<CommentOutlined />}
              aria-label={`查看${task.title}的评论`}
              onClick={() => onOpenDetails(task.id)}
            />
          </Tooltip>
          {!readOnly && (
            <Tooltip title="编辑任务">
              <Button
                className="task-card__action"
                size="small"
                shape="circle"
                icon={<EditOutlined />}
                aria-label={`编辑任务：${task.title}`}
                onClick={() => onEdit(task)}
              />
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title="删除这条任务？"
              description="相关评论也会一并删除。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => onDelete(task.id)}
            >
              <Tooltip title="删除任务">
                <Button
                  className="task-card__action task-card__action--delete"
                  size="small"
                  danger
                  shape="circle"
                  icon={<DeleteOutlined />}
                  aria-label={`删除任务：${task.title}`}
                  loading={isThisTaskPending}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </div>
      </div>
    </article>
  );
});
