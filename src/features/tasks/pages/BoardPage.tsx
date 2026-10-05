import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Alert, Button, Drawer, Input, Modal, Select, Tooltip } from "antd";
import {
  CheckCircleFilled,
  PlusOutlined,
  SettingOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { TaskCard } from "../components/TaskCard";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { TaskToolbar } from "../components/TaskToolbar";
import { TaskBoardColumn } from "../components/TaskBoardColumn";
import {
  createTask,
  deleteTask,
  getTasks,
  persistTaskOrder,
  updateTask,
} from "../api/taskApi";
import {
  getCurrentProjectRole,
  getCurrentUserIsSystemAdmin,
  getProjectById,
  getProjectMembers,
} from "../../projects/api/projectApi";
import { ProjectInviteButton } from "../../projects/components/ProjectInviteButton";
import { ProjectManagement } from "../../projects/components/ProjectManagement";
import { useAuthSession } from "../../auth/AuthSessionContext";
import { supabase } from "../../../lib/supabase";
import { useTaskUiStore } from "../store/taskUiStore";
import { filterTasks } from "../utils/filterTasks";
import type { Task } from "../types";
import { AUTO_REFRESH_INTERVAL_MS } from "../../../lib/queryConfig";
export function BoardPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const session = useAuthSession();
  const userId = session?.user.id;
  const taskListKey = ["tasks", userId, projectId] as const;
  const projectQuery = useQuery({
    queryKey: ["project", userId, projectId],
    queryFn: () => getProjectById(projectId!),
    enabled: Boolean(supabase && userId && projectId),
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: "always",
  });
  const isArchived = Boolean(projectQuery.data?.archivedAt);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const adminQuery = useQuery({
    queryKey: ["currentUserIsSystemAdmin", userId],
    queryFn: getCurrentUserIsSystemAdmin,
    enabled: Boolean(supabase && userId),
  });
  const roleQuery = useQuery({
    queryKey: ["projectRole", userId, projectId],
    queryFn: () => getCurrentProjectRole(projectId!, userId!),
    enabled: Boolean(supabase && userId && projectId),
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: "always",
  });
  const {
    data: tasks = [],
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: taskListKey,
    queryFn: () => getTasks(projectId!),
    enabled: Boolean(supabase && userId && projectId),
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: "always",
  });
  const membersQuery = useQuery({
    queryKey: ["projectMembers", userId, projectId],
    queryFn: () => getProjectMembers(projectId!),
    enabled: Boolean(supabase && userId && projectId),
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: "always",
  });
  const queryClient = useQueryClient();
  const search = useTaskUiStore((state) => state.search);
  const statusFilter = useTaskUiStore((state) => state.statusFilter);
  const openTask = useTaskUiStore((state) => state.openTask);
  const selectedTaskId = useTaskUiStore((state) => state.selectedTaskId);
  const closeTask = useTaskUiStore((state) => state.closeTask);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [projectManagementOpen, setProjectManagementOpen] = useState(false);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const [dragPreviewTasks, setDragPreviewTasks] = useState<Task[] | null>(null);
  const dragPreviewRef = useRef<Task[] | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  useEffect(() => {
    if (!actionNotice) return;
    const timeoutId = window.setTimeout(() => setActionNotice(""), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [actionNotice]);
  const refreshTasks = () =>
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const manuallyRefreshTasks = async () => {
    setActionNotice("");
    setActionError("");
    setManualRefreshPending(true);
    try {
      await queryClient.refetchQueries(
        { queryKey: ["tasks"], type: "active" },
        { throwOnError: true },
      );
      setActionNotice("任务和已打开的详情已更新。");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "刷新失败，请重试。");
    } finally {
      setManualRefreshPending(false);
    }
  };
  const createMutation = useMutation({
    mutationFn: (title: string) => createTask(projectId!, title, userId!),
    onSuccess: (createdTask) => {
      setNewTaskTitle("");
      setActionError("");
      queryClient.setQueryData<Task[]>(taskListKey, (current = []) => [...current, createdTask]);
    },
    onError: (e) => setActionError(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: Partial<
        Pick<Task, "title" | "status" | "priority" | "assigneeUserId">
      >;
    }) => updateTask(projectId!, id, changes),
    onSuccess: (updatedTask) => {
      setEditingTask(null);
      setActionError("");
      queryClient.setQueryData<Task[]>(taskListKey, (current = []) =>
        current.map((task) => task.id === updatedTask.id ? updatedTask : task),
      );
      queryClient.setQueryData(
        ["tasks", "detail", userId, projectId, updatedTask.id],
        updatedTask,
      );
    },
    onError: (e) => setActionError(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTask(projectId!, id),
    onSuccess: (_result, deletedTaskId) => {
      setActionError("");
      setActionNotice("任务已删除。");
      if (selectedTaskId === deletedTaskId) closeTask();
      queryClient.setQueryData<Task[]>(taskListKey, (current = []) =>
        current.filter((task) => task.id !== deletedTaskId),
      );
    },
    onError: async (e) => {
      setActionNotice("");
      setActionError(e.message);
      await queryClient.invalidateQueries({ queryKey: taskListKey, exact: true });
    },
  });
  const reorderMutation = useMutation({
    mutationFn: ({ ordered }: { ordered: Task[]; previous?: Task[] }) =>
      persistTaskOrder(projectId!, ordered),
    onMutate: ({ previous }) => ({ previous }),
    onSuccess: () => {
      setActionError("");
      setActionNotice("任务排序已保存。其他协作者稍后会自动看到更新。");
    },
    onError: async (e, _ordered, context) => {
      const key = taskListKey;
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      setActionNotice("");
      setActionError(e.message);
      await queryClient.invalidateQueries({ queryKey: taskListKey, exact: true });
    },
  });
  const completeTask = useCallback(
    (id: string) => updateMutation.mutate({ id, changes: { status: "done" } }),
    [updateMutation.mutate],
  );
  const removeTask = useCallback(
    (id: string) => deleteMutation.mutate(id),
    [deleteMutation.mutate],
  );

  if (!supabase)
    return (
      <main className="simple-page">
        <h1>演示看板</h1>
        <Alert
          type="info"
          showIcon
          message="演示模式暂不连接数据库"
          description="登录 Supabase 后即可在项目看板中保存真实任务。"
        />
      </main>
    );
  if (projectQuery.isPending)
    return <main className="page-state">正在加载项目……</main>;
  if (projectQuery.isError)
    return (
      <main className="page-state">
        <Alert
          type="error"
          showIcon
          message="项目加载失败"
          description={projectQuery.error.message}
          action={
            <Button onClick={() => void projectQuery.refetch()}>重试</Button>
          }
        />
      </main>
    );

  if (isPending) return <main className="page-state">正在加载任务……</main>;
  if (isError && tasks.length === 0)
    return (
      <main className="page-state">
        <Alert
          type="error"
          showIcon
          message="任务加载失败"
          description={error.message}
          action={<Button onClick={() => void refreshTasks()}>重试</Button>}
        />
      </main>
    );

  const orderedTasks = [...tasks].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );
  const visibleTasks = filterTasks(orderedTasks, search, statusFilter);
  const displayedTasks = dragPreviewTasks ?? visibleTasks;
  const columns: Array<{
    status: Task["status"];
    title: string;
    tasks: Task[];
  }> = [
    {
      status: "todo",
      title: "待处理",
      tasks: displayedTasks.filter((task) => task.status === "todo"),
    },
    {
      status: "doing",
      title: "进行中",
      tasks: displayedTasks.filter((task) => task.status === "doing"),
    },
    {
      status: "done",
      title: "已完成",
      tasks: displayedTasks.filter((task) => task.status === "done"),
    },
  ];
  const isPendingTask = (id: string) =>
    (updateMutation.isPending && updateMutation.variables.id === id) ||
    (deleteMutation.isPending && deleteMutation.variables === id);
  const canDeleteTask = (task: Task) =>
    !isArchived &&
    (adminQuery.data === true ||
      roleQuery.data === "owner" ||
      (roleQuery.data === "member" && task.createdBy === userId));
  const canReorder = !isArchived && !search.trim() && statusFilter === "all";
  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragTaskId(String(active.id));
    dragPreviewRef.current = orderedTasks;
    setDragPreviewTasks(orderedTasks);
  };
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const current = dragPreviewRef.current;
    if (!current || !over || active.id === over.id) return;

    const statuses: Task["status"][] = ["todo", "doing", "done"];
    const draggedTask = current.find((task) => task.id === active.id);
    const overTask = current.find((task) => task.id === over.id);
    const destination = overTask?.status ?? (statuses.includes(over.id as Task["status"])
      ? (over.id as Task["status"])
      : undefined);
    if (!draggedTask || !destination) return;

    const sourceList = current.filter((task) => task.status === draggedTask.status);
    const sourceIndex = sourceList.findIndex((task) => task.id === draggedTask.id);
    const translatedRect = active.rect.current.translated;
    const activeCenter = translatedRect
      ? translatedRect.top + translatedRect.height / 2
      : over.rect.top + over.rect.height / 2;
    const insertAfter = activeCenter > over.rect.top + over.rect.height / 2;

    if (draggedTask.status === destination) {
      const targetIndex = overTask
        ? sourceList.findIndex((task) => task.id === overTask.id) + (insertAfter ? 1 : 0)
        : sourceList.length;
      const adjustedIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
      if (adjustedIndex < 0 || adjustedIndex === sourceIndex) return;
      const reordered = arrayMove(sourceList, sourceIndex, adjustedIndex);
      const next = statuses.flatMap((status) =>
        status === destination ? reordered : current.filter((task) => task.status === status),
      );
      dragPreviewRef.current = next;
      setDragPreviewTasks(next);
      return;
    }

    const destinationList = current.filter((task) => task.status === destination);
    const targetIndex = overTask
      ? destinationList.findIndex((task) => task.id === overTask.id) + (insertAfter ? 1 : 0)
      : destinationList.length;
    const movedTask = { ...draggedTask, status: destination };
    const nextDestination = [
      ...destinationList.slice(0, targetIndex),
      movedTask,
      ...destinationList.slice(targetIndex),
    ];
    const next = statuses.flatMap((status) =>
      status === draggedTask.status
        ? sourceList.filter((task) => task.id !== draggedTask.id)
        : status === destination
          ? nextDestination
          : current.filter((task) => task.status === status),
    );
    dragPreviewRef.current = next;
    setDragPreviewTasks(next);
  };
  const handleDragEnd = ({ over }: DragEndEvent) => {
    setActiveDragTaskId(null);
    const next = dragPreviewRef.current;
    dragPreviewRef.current = null;
    if (!over || !canReorder || reorderMutation.isPending || !next) {
      setDragPreviewTasks(null);
      return;
    }
    const changed = next.some((task, index) =>
      task.id !== orderedTasks[index]?.id || task.status !== orderedTasks[index]?.status,
    );
    if (changed) {
      const previous = queryClient.getQueryData<Task[]>(taskListKey);
      const nextSortOrders = new Map<Task["status"], number>();
      const orderedForCache = next.map((task) => {
        const sortOrder = nextSortOrders.get(task.status) ?? 0;
        nextSortOrders.set(task.status, sortOrder + 1);
        return task.sortOrder === sortOrder ? task : { ...task, sortOrder };
      });
      void queryClient.cancelQueries({ queryKey: taskListKey, exact: true });
      queryClient.setQueryData(taskListKey, orderedForCache);
      setDragPreviewTasks(null);
      reorderMutation.mutate({ ordered: orderedForCache, previous });
    } else {
      setDragPreviewTasks(null);
    }
  };
  const handleDragCancel = () => {
    setActiveDragTaskId(null);
    dragPreviewRef.current = null;
    setDragPreviewTasks(null);
  };

  return (
    <main className={`kanban-page${activeDragTaskId ? " kanban-page--dragging" : ""}`}>
      <header className="kanban-header">
        <div className="kanban-heading">
          <p className="eyebrow">
            <Link to="/projects">我的项目</Link>
            <span aria-hidden="true">/</span>
            {projectQuery.data.name}
          </p>
          <h1>任务看板</h1>
          <p className="project-intro">
            把项目的下一步放在一起，清晰推进每一项工作。
          </p>
          {isArchived && <span className="project-state-tag">已归档</span>}
        </div>
        <div className="kanban-header-actions">
          {!isArchived && (
            <ProjectInviteButton key={projectId} projectId={projectId} />
          )}
          <Button
            className="project-management-trigger"
            icon={<SettingOutlined />}
            onClick={() => setProjectManagementOpen(true)}
          >
            项目管理
          </Button>
          <Button onClick={() => navigate("/projects")}>返回项目</Button>
        </div>
      </header>
      <div className="board-entry-row">
        {!isArchived && (
          <form
            className="task-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              const title = newTaskTitle.trim();
              if (title && !createMutation.isPending)
                createMutation.mutate(title);
            }}
          >
            <label className="task-create-label" htmlFor="new-task-title">
              添加一项任务
            </label>
            <div className="task-create-controls">
              <Input
                id="new-task-title"
                className="task-create-input"
                value={newTaskTitle}
                maxLength={120}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                placeholder="写下接下来要做的事"
                aria-label="新任务标题"
              />
              <Button
                className="kanban-create-button"
                type="primary"
                htmlType="submit"
                icon={<PlusOutlined />}
                aria-label="添加任务"
                loading={createMutation.isPending}
                disabled={!newTaskTitle.trim()}
              >
                添加任务
              </Button>
            </div>
          </form>
        )}
        <div className="board-refresh">
          <Tooltip title="立即刷新任务">
            <Button
              className="board-refresh__button"
              type="text"
              icon={<SyncOutlined />}
              aria-label="立即刷新任务"
              onClick={() => void manuallyRefreshTasks()}
              loading={manualRefreshPending}
            />
          </Tooltip>
        </div>
      </div>
      {isArchived && (
        <Alert
          className="board-alert"
          type="info"
          showIcon
          title="项目已归档"
          description="任务和评论可查看，恢复项目后才能继续修改。"
        />
      )}
      {actionError && (
        <Alert
          className="board-alert"
          type="error"
          showIcon
          closable
          title="操作未完成"
          description={actionError}
          onClose={() => setActionError("")}
        />
      )}
      {actionNotice && (
        <div className="board-toast" role="status" aria-live="polite">
          <CheckCircleFilled aria-hidden="true" />
          <span>{actionNotice}</span>
        </div>
      )}
      {(adminQuery.isError || roleQuery.isError) && (
        <Alert
          className="board-alert"
          type="error"
          showIcon
          title="删除权限加载失败"
          description={adminQuery.error?.message ?? roleQuery.error?.message}
          action={
            <Button
              onClick={() => {
                void adminQuery.refetch();
                void roleQuery.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      )}
      {isError && (
        <Alert
          className="board-alert"
          type="error"
          showIcon
          title="任务刷新失败，当前显示的是上次结果"
          description={error.message}
          action={
            <Button onClick={() => void manuallyRefreshTasks()}>重试</Button>
          }
        />
      )}
      {!isArchived && (
        <p
          className={`board-drag-hint${canReorder ? "" : " board-drag-hint--muted"}`}
        >
          {canReorder
            ? "拖动卡片左上角手柄可调整顺序或移动状态。"
            : "清空搜索并选择“全部状态”后可拖动排序。"}
          {reorderMutation.isPending && (
            <span role="status"> 正在保存排序…</span>
          )}
        </p>
      )}
      <TaskToolbar visibleTasksLength={visibleTasks.length} />
      {tasks.length === 0 ? (
        <section className="board-welcome">
          <span className="board-welcome__mark">✳</span>
          <h2>从一条任务开始</h2>
          <p>创建第一条任务，项目成员就可以开始安排工作了。</p>
        </section>
      ) : visibleTasks.length === 0 ? (
        <section className="board-welcome">
          <h2>没有匹配的任务</h2>
          <p>试试其他关键词或筛选条件。</p>
        </section>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <section className="kanban-board" aria-label="任务看板">
            {columns.map((column) => (
              <TaskBoardColumn
                key={column.status}
                status={column.status}
                title={column.title}
                tasks={column.tasks}
              >
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={completeTask}
                    onEdit={setEditingTask}
                    onDelete={removeTask}
                    canDelete={canDeleteTask(task)}
                    readOnly={isArchived}
                    isDraggable={canReorder && !reorderMutation.isPending}
                    onOpenDetails={openTask}
                    isThisTaskPending={isPendingTask(task.id)}
                  />
                ))}
              </TaskBoardColumn>
            ))}
          </section>
          <DragOverlay>
            {activeDragTaskId && (() => {
              const task = orderedTasks.find((item) => item.id === activeDragTaskId);
              if (!task) return null;
              return (
                <article className="task-card task-card--drag-overlay" aria-hidden="true">
                  <h3 className="task-card__title">{task.title}</h3>
                  <div className="task-card__meta">
                    <span className={`task-card__priority task-card__priority--${task.priority}`}>
                      {{ low: "低", medium: "中", high: "高" }[task.priority]}优先级
                    </span>
                    <span className="task-card__assignee">{task.assignee || "未分配"}</span>
                  </div>
                </article>
              );
            })()}
          </DragOverlay>
        </DndContext>
      )}
      <TaskDetailPanel
        projectId={projectId}
        userId={userId!}
        readOnly={isArchived}
      />
      <Drawer
        className="project-management-drawer"
        title="项目管理"
        placement="right"
        size={480}
        open={projectManagementOpen}
        onClose={() => setProjectManagementOpen(false)}
        destroyOnHidden
        styles={{
          mask: {
            background: "rgb(42 38 33 / 18%)",
            backdropFilter: "blur(6px)",
          },
          section: {
            background: "rgb(250 249 246 / 72%)",
            backdropFilter: "blur(28px) saturate(140%)",
            boxShadow: "-12px 0 36px rgb(35 30 24 / 8%)",
          },
          body: { padding: 0 },
        }}
      >
        <ProjectManagement
          project={projectQuery.data}
          members={membersQuery.data ?? []}
          membersPending={membersQuery.isPending}
          membersError={membersQuery.error?.message}
          onRetryMembers={() => void membersQuery.refetch()}
          isOwner={roleQuery.data === "owner"}
          isAdmin={adminQuery.data === true}
          currentUserId={userId!}
        />
      </Drawer>
      <Modal
        title="编辑任务"
        open={editingTask !== null && !isArchived}
        okText="保存修改"
        cancelText="取消"
        confirmLoading={updateMutation.isPending}
        okButtonProps={{ disabled: !editingTask?.title.trim() }}
        onCancel={() => setEditingTask(null)}
        onOk={() => {
          if (editingTask?.title.trim())
            updateMutation.mutate({
              id: editingTask.id,
              changes: {
                title: editingTask.title.trim(),
                status: editingTask.status,
                priority: editingTask.priority,
                assigneeUserId: editingTask.assigneeUserId,
              },
            });
        }}
      >
        {editingTask && (
          <div className="task-edit-form">
            <label>
              标题
              <Input
                autoFocus
                maxLength={120}
                value={editingTask.title}
                onChange={(e) =>
                  setEditingTask({ ...editingTask, title: e.target.value })
                }
              />
            </label>
            <label>
              状态
              <Select
                value={editingTask.status}
                onChange={(status) => setEditingTask({ ...editingTask, status })}
                options={[
                  { label: "待处理", value: "todo" },
                  { label: "进行中", value: "doing" },
                  { label: "已完成", value: "done" },
                ]}
              />
            </label>
            <label>
              优先级
              <Select
                value={editingTask.priority}
                onChange={(priority) =>
                  setEditingTask({ ...editingTask, priority })
                }
                options={[
                  { label: "高", value: "high" },
                  { label: "中", value: "medium" },
                  { label: "低", value: "low" },
                ]}
              />
            </label>
            <label>
              负责人
              <Select
                allowClear
                placeholder="未分配"
                value={editingTask.assigneeUserId ?? undefined}
                onChange={(assigneeUserId) =>
                  setEditingTask({
                    ...editingTask,
                    assigneeUserId: assigneeUserId ?? null,
                  })
                }
                options={(membersQuery.data ?? []).map((member) => ({
                  label: member.name,
                  value: member.userId,
                }))}
              />
            </label>
          </div>
        )}
      </Modal>
    </main>
  );
}

