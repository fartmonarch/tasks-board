import "./App.css";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Alert, Button, Drawer, Input, Modal, Select, Tooltip } from "antd";
import { CheckCircleFilled, LeftOutlined, PlusOutlined, SettingOutlined, SyncOutlined } from "@ant-design/icons";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { TaskCard } from "../features/tasks/components/TaskCard";
import { TaskDetailPanel } from "../features/tasks/components/TaskDetailPanel";
import { TaskToolbar } from "../features/tasks/components/TaskToolbar";
import { TaskBoardColumn } from "../features/tasks/components/TaskBoardColumn";
import {
  createTask,
  deleteTask,
  getTasks,
  persistTaskOrder,
  updateTask,
} from "../features/tasks/api/taskApi";
import {
  createProject,
  getAllProjects,
  getCurrentProjectRole,
  getCurrentUserIsSystemAdmin,
  getProjectById,
  getProjectMembers,
  getWorkspace,
} from "../features/projects/api/projectApi";
import { ProjectInviteButton } from "../features/projects/components/ProjectInviteButton";
import { ProjectManagement } from "../features/projects/components/ProjectManagement";
import { ProjectInvitationPage } from "../features/projects/pages/ProjectInvitationPage";
import { useAuthSession } from "../features/auth/AuthSessionContext";
import {
  getCurrentProfile,
  updateCurrentProfile,
} from "../features/auth/profileApi";
import { supabase } from "../lib/supabase";
import { useTaskUiStore } from "../features/tasks/store/taskUiStore";
import { filterTasks } from "../features/tasks/utils/filterTasks";
import type { Task } from "../features/tasks/types";

function BoardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const session = useAuthSession();
  const userId = session?.user.id;
  const projectQuery = useQuery({
    queryKey: ["project", userId, projectId],
    queryFn: () => getProjectById(projectId!),
    enabled: Boolean(supabase && userId && projectId),
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });
  const isArchived = Boolean(projectQuery.data?.archivedAt);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });
  const {
    data: tasks = [],
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["tasks", userId, projectId],
    queryFn: () => getTasks(projectId!),
    enabled: Boolean(supabase && userId && projectId),
    refetchInterval: 10_000,
    refetchOnWindowFocus: "always",
  });
  const membersQuery = useQuery({
    queryKey: ["projectMembers", userId, projectId],
    queryFn: () => getProjectMembers(projectId!),
    enabled: Boolean(supabase && userId && projectId),
    refetchInterval: 10_000,
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
    mutationFn: (title: string) => createTask(projectId!, title),
    onSuccess: async () => {
      setNewTaskTitle("");
      setActionError("");
      await refreshTasks();
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
    onSuccess: async () => {
      setEditingTask(null);
      setActionError("");
      await refreshTasks();
    },
    onError: (e) => setActionError(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTask(projectId!, id),
    onSuccess: async () => {
      setActionError("");
      setActionNotice("任务已删除。");
      if (selectedTaskId === deleteMutation.variables) closeTask();
      await refreshTasks();
    },
    onError: async (e) => {
      setActionNotice("");
      setActionError(e.message);
      await refreshTasks();
    },
  });
  const reorderMutation = useMutation({
    mutationFn: (ordered: Task[]) => persistTaskOrder(projectId!, ordered),
    onMutate: async (ordered) => {
      const key = ["tasks", userId, projectId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData(key, ordered);
      return { previous };
    },
    onSuccess: async () => {
      setActionError("");
      setActionNotice("任务排序已保存。其他协作者稍后会自动看到更新。");
      await refreshTasks();
    },
    onError: async (e, _ordered, context) => {
      const key = ["tasks", userId, projectId];
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      setActionNotice("");
      setActionError(e.message);
      await refreshTasks();
    },
  });

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
  if (!projectId) return <Navigate to="/projects" replace />;
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

  const orderedTasks = [...tasks].sort((a, b) =>
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );
  const visibleTasks = filterTasks(orderedTasks, search, statusFilter);
  const columns: Array<{
    status: Task["status"];
    title: string;
    tasks: Task[];
  }> = [
    {
      status: "todo",
      title: "待处理",
      tasks: visibleTasks.filter((task) => task.status === "todo"),
    },
    {
      status: "doing",
      title: "进行中",
      tasks: visibleTasks.filter((task) => task.status === "doing"),
    },
    {
      status: "done",
      title: "已完成",
      tasks: visibleTasks.filter((task) => task.status === "done"),
    },
  ];
  const isPendingTask = (id: string) =>
    (updateMutation.isPending && updateMutation.variables.id === id) ||
    (deleteMutation.isPending && deleteMutation.variables === id);
  const canDeleteTask = (task: Task) =>
    !isArchived && (
      adminQuery.data === true ||
      roleQuery.data === "owner" ||
      (roleQuery.data === "member" && task.createdBy === userId));
  const canReorder = !isArchived && !search.trim() && statusFilter === "all";
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || !canReorder || reorderMutation.isPending) return;
    const activeTask = orderedTasks.find((task) => task.id === active.id);
    if (!activeTask || String(over.id) === activeTask.id) return;
    const statuses: Task["status"][] = ["todo", "doing", "done"];
    const destination = statuses.includes(over.id as Task["status"])
      ? over.id as Task["status"]
      : orderedTasks.find((task) => task.id === over.id)?.status;
    if (!destination) return;
    const lists = Object.fromEntries(statuses.map((status) => [
      status,
      orderedTasks.filter((task) => task.status === status),
    ])) as Record<Task["status"], Task[]>;
    const sourceList = lists[activeTask.status];
    const sourceIndex = sourceList.findIndex((task) => task.id === activeTask.id);
    if (sourceIndex < 0) return;
    if (activeTask.status === destination) {
      const targetIndex = over.id === destination
        ? sourceList.length - 1
        : sourceList.findIndex((task) => task.id === over.id);
      if (targetIndex < 0 || targetIndex === sourceIndex) return;
      lists[destination] = arrayMove(sourceList, sourceIndex, targetIndex);
    } else {
      lists[activeTask.status] = sourceList.filter((task) => task.id !== activeTask.id);
      const destinationList = lists[destination];
      const targetIndex = over.id === destination
        ? destinationList.length
        : destinationList.findIndex((task) => task.id === over.id);
      const insertAt = targetIndex < 0 ? destinationList.length : targetIndex;
      const movedTask = { ...activeTask, status: destination };
      lists[destination] = [...destinationList.slice(0, insertAt), movedTask, ...destinationList.slice(insertAt)];
    }
    const next = statuses.flatMap((status) => lists[status].map((task, sortOrder) => ({
      ...task,
      status,
      sortOrder,
    })));
    reorderMutation.mutate(next);
  };

  return (
    <main className="kanban-page">
      <header className="kanban-header">
        <div className="kanban-heading">
          <p className="eyebrow"><Link to="/projects">我的项目</Link><span aria-hidden="true">/</span>{projectQuery.data.name}</p>
          <h1>任务看板</h1>
          <p className="project-intro">把项目的下一步放在一起，清晰推进每一项工作。</p>
          {isArchived && <span className="project-state-tag">已归档</span>}
        </div>
        <div className="kanban-header-actions">
          {!isArchived && <ProjectInviteButton key={projectId} projectId={projectId} />}
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
      {isArchived && <Alert className="board-alert" type="info" showIcon
        title="项目已归档" description="任务和评论可查看，恢复项目后才能继续修改。" />}
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
        <Alert className="board-alert" type="error" showIcon
          title="删除权限加载失败"
          description={adminQuery.error?.message ?? roleQuery.error?.message}
          action={<Button onClick={() => {
            void adminQuery.refetch();
            void roleQuery.refetch();
          }}>重试</Button>} />
      )}
      {isError && (
        <Alert className="board-alert" type="error" showIcon
          title="任务刷新失败，当前显示的是上次结果"
          description={error.message}
          action={<Button onClick={() => void manuallyRefreshTasks()}>重试</Button>} />
      )}
      {!isArchived && <p className={`board-drag-hint${canReorder ? "" : " board-drag-hint--muted"}`}>
        {canReorder ? "拖动卡片左上角手柄可调整顺序或移动状态。" : "清空搜索并选择“全部状态”后可拖动排序。"}
        {reorderMutation.isPending && <span role="status"> 正在保存排序…</span>}
      </p>}
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
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <section className="kanban-board" aria-label="任务看板">
            {columns.map((column) => (
              <TaskBoardColumn key={column.status} status={column.status} title={column.title} tasks={column.tasks}>
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={(id) => updateMutation.mutate({ id, changes: { status: "done" } })}
                    onStatusChange={(id, status) => updateMutation.mutate({ id, changes: { status } })}
                    onEdit={setEditingTask}
                    onDelete={(id) => deleteMutation.mutate(id)}
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
        </DndContext>
      )}
      <TaskDetailPanel projectId={projectId} userId={userId!} readOnly={isArchived} />
      <Drawer
        className="project-management-drawer"
        title="项目管理"
        placement="right"
        size={480}
        open={projectManagementOpen}
        onClose={() => setProjectManagementOpen(false)}
        destroyOnHidden
        styles={{
          mask: { background: "rgb(42 38 33 / 18%)", backdropFilter: "blur(6px)" },
          section: {
            background: "rgb(250 249 246 / 72%)",
            backdropFilter: "blur(28px) saturate(140%)",
            boxShadow: "-12px 0 36px rgb(35 30 24 / 8%)",
          },
          body: { padding: 0 },
        }}
      >
        <ProjectManagement project={projectQuery.data} members={membersQuery.data ?? []}
          membersPending={membersQuery.isPending} membersError={membersQuery.error?.message}
          onRetryMembers={() => void membersQuery.refetch()}
          isOwner={roleQuery.data === "owner"} isAdmin={adminQuery.data === true}
          currentUserId={userId!} />
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

function ProjectsPage({ showAll = false }: { showAll?: boolean }) {
  const session = useAuthSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState("");
  const adminQuery = useQuery({
    queryKey: ["currentUserIsSystemAdmin", userId],
    queryFn: getCurrentUserIsSystemAdmin,
    enabled: Boolean(supabase && userId),
  });
  const workspaceQuery = useQuery({
    queryKey: ["workspace", "projects", userId],
    queryFn: getWorkspace,
    enabled: Boolean(supabase && userId && !showAll),
  });
  const allProjectsQuery = useQuery({
    queryKey: ["workspace", "allProjects", userId],
    queryFn: getAllProjects,
    enabled: Boolean(supabase && userId && showAll && adminQuery.data === true),
  });
  const refreshWorkspace = () =>
    queryClient.invalidateQueries({
      queryKey: ["workspace"],
    });
  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      setProjectName("");
      await refreshWorkspace();
    },
  });

  if (!supabase)
    return (
      <main className="simple-page">
        <p className="eyebrow">PROJECT TASKS</p>
        <h1>项目</h1>
        <Alert
          type="info"
          showIcon
          message="配置 Supabase 后可创建真实项目"
          description="当前为本地演示模式。"
        />
        <Link to="/projects/p1/board">打开演示看板 →</Link>
      </main>
    );

  const operationError = createProjectMutation.error?.message;
  const projects = showAll ? allProjectsQuery.data : workspaceQuery.data?.projects;
  const listPending = showAll ? allProjectsQuery.isPending : workspaceQuery.isPending;
  const listError = showAll ? allProjectsQuery.error : workspaceQuery.error;
  const retryList = showAll ? allProjectsQuery.refetch : workspaceQuery.refetch;

  if (showAll && adminQuery.data === false) return <Navigate to="/projects" replace />;

  return (
    <main className="simple-page projects-page">
      <header className="projects-header">
        <div>
          <p className="eyebrow">PROJECT TASKS <span aria-hidden="true">/</span> WORKSPACE</p>
          <h1>{showAll ? "全部项目" : "我的项目"}</h1>
          <p className="projects-intro">让每个项目的进度与协作，都有一个清晰的位置。</p>
        </div>
        <Link className="profile-link" to="/settings">个人资料 <span aria-hidden="true">↗</span></Link>
      </header>
      <nav className="project-nav" aria-label="项目列表范围">
        <Link className={!showAll ? "project-nav__active" : ""} to="/projects">
          我的项目
        </Link>
        {adminQuery.data === true && (
          <Link className={showAll ? "project-nav__active" : ""} to="/projects/all">
            全部项目
          </Link>
        )}
      </nav>
      {adminQuery.isError && (
        <Alert type="error" showIcon title="管理员身份加载失败"
          description={adminQuery.error.message}
          action={<Button onClick={() => void adminQuery.refetch()}>重试</Button>} />
      )}
      {((showAll && adminQuery.isPending) ||
        (listPending && (!showAll || adminQuery.data === true))) &&
        <p>正在加载项目……</p>}
      {listError && (
        <Alert
          type="error"
          showIcon
          message="项目加载失败"
          description={listError.message}
          action={
            <Button onClick={() => void retryList()}>重试</Button>
          }
        />
      )}
      {operationError && (
        <Alert
          className="project-alert"
          type="error"
          showIcon
          closable
          message="操作未完成"
          description={operationError}
        />
      )}
      {projects && (
        <div className={`projects-layout${showAll ? " projects-layout--all" : ""}`}>
          <section className="project-list" aria-labelledby="project-list-title">
            <div className="project-list__heading">
              <h2 id="project-list-title">项目空间</h2>
              <span>{projects.length} 个项目</span>
            </div>
            {projects.length === 0 ? (
              <div className="projects-empty">
                <span className="projects-empty__mark" aria-hidden="true">＋</span>
                <h3>{showAll ? "目前没有项目" : "这里还没有项目"}</h3>
                <p>{showAll ? "目前没有可展示的项目。" : "创建一个项目，或通过组长分享的邀请链接加入。"}</p>
              </div>
            ) : (
              <div className="project-list__items">
                {projects.map((project) => (
                  <Link
                    className="project-list__item"
                    key={project.id}
                    to={`/projects/${project.id}/board`}
                  >
                    <span className="project-list__symbol" aria-hidden="true">{project.name.slice(0, 1)}</span>
                    <span className="project-list__copy">
                      <strong>{project.name}</strong>
                      <span>
                        {"role" in project && project.role
                          ? project.role === "owner" ? "组长" : "协作者"
                          : showAll ? "管理员视图" : "协作者"}
                        {project.archivedAt ? " · 已归档" : ""}
                      </span>
                    </span>
                    <span className="project-list__arrow" aria-hidden="true">↗</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
          {!showAll && <aside className="project-create-panel">
            <p className="eyebrow">NEW SPACE</p>
            <h2>开启一个新项目</h2>
            <p className="project-create-panel__intro">从清晰的目标开始，和团队一起推进。</p>
            <form
              className="project-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (projectName.trim())
                  createProjectMutation.mutate(projectName.trim());
              }}
            >
              <label htmlFor="new-project-name">项目名称</label>
              <Input
                id="new-project-name"
                value={projectName}
                maxLength={120}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="例如：产品迭代"
              />
              <Button
                type="primary"
                htmlType="submit"
                loading={createProjectMutation.isPending}
                disabled={!projectName.trim()}
              >
                创建项目
              </Button>
            </form>
          </aside>}
        </div>
      )}
    </main>
  );
}
function SettingsPage() {
  const session = useAuthSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: getCurrentProfile,
    enabled: Boolean(supabase && userId),
  });
  const currentDisplayName =
    displayName ?? profileQuery.data?.displayName ?? "";
  const saveMutation = useMutation({
    mutationFn: updateCurrentProfile,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
        queryClient.invalidateQueries({ queryKey: ["projectMembers"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
    },
  });
  if (!supabase)
    return (
      <main className="simple-page settings-page">
        <header className="settings-header">
          <div>
            <p className="eyebrow">PREFERENCES <span aria-hidden="true">/</span> PROFILE</p>
            <h1>个人资料</h1>
          </div>
          <Link className="settings-back" to="/projects"><LeftOutlined /> 返回项目</Link>
        </header>
        <Alert type="info" showIcon message="演示模式下不能保存资料" />
      </main>
    );
  return (
    <main className="simple-page settings-page">
      <header className="settings-header">
        <div>
          <p className="eyebrow">PREFERENCES <span aria-hidden="true">/</span> PROFILE</p>
          <h1>个人资料</h1>
          <p className="settings-intro">设置在项目成员、任务负责人和评论中显示的名称。</p>
        </div>
        <Link className="settings-back" to="/projects"><LeftOutlined /> 返回项目</Link>
      </header>
      <div className="settings-layout">
        <section className="settings-card" aria-labelledby="settings-profile-title">
          <div className="settings-card__heading">
            <h2 id="settings-profile-title">协作资料</h2>
            <p>你的账号邮箱不会公开显示，项目中只展示这个名称。</p>
          </div>
          {profileQuery.isPending && <p className="settings-loading">正在加载资料……</p>}
          {profileQuery.isError && (
            <Alert
              type="error"
              showIcon
              title="资料加载失败"
              description={profileQuery.error.message}
            />
          )}
          {saveMutation.isError && (
            <Alert
              className="settings-feedback"
              type="error"
              showIcon
              title="保存失败"
              description={saveMutation.error.message}
            />
          )}
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (currentDisplayName.trim())
                saveMutation.mutate(currentDisplayName);
            }}
          >
            <div className="settings-field">
              <label htmlFor="profile-display-name">显示名称</label>
              <Input
                id="profile-display-name"
                value={currentDisplayName}
                maxLength={100}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：林然"
              />
              <span>最多 100 个字符</span>
            </div>
            <div className="settings-actions">
              <span>保存后会同步到你参与的项目</span>
              <Button
                type="primary"
                htmlType="submit"
                loading={saveMutation.isPending}
                disabled={!currentDisplayName.trim()}
              >
                保存更改
              </Button>
            </div>
          </form>
          {saveMutation.isSuccess && (
            <Alert className="settings-feedback" type="success" showIcon title="名称已保存" />
          )}
        </section>
        <aside className="settings-note">
          <p className="eyebrow">HOW IT APPEARS</p>
          <h2>让协作更清楚</h2>
          <p>显示名称会出现在任务负责人、项目成员列表和评论记录中，方便团队辨认彼此。</p>
        </aside>
      </div>
    </main>
  );
}
function App() {
  return (
    <Routes>
      <Route path="/invite" element={<ProjectInvitationPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/all" element={<ProjectsPage showAll />} />
      <Route path="/projects/:projectId/board" element={<BoardPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
export default App;
