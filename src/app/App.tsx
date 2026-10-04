import "./App.css";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Modal, Select } from "antd";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { TaskCard } from "../features/tasks/components/TaskCard";
import { TaskDetailPanel } from "../features/tasks/components/TaskDetailPanel";
import { TaskToolbar } from "../features/tasks/components/TaskToolbar";
import {
  createTask,
  deleteTask,
  getTasks,
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
  });
  const adminQuery = useQuery({
    queryKey: ["currentUserIsSystemAdmin", userId],
    queryFn: getCurrentUserIsSystemAdmin,
    enabled: Boolean(supabase && userId),
  });
  const roleQuery = useQuery({
    queryKey: ["projectRole", userId, projectId],
    queryFn: () => getCurrentProjectRole(projectId!, userId!),
    enabled: Boolean(supabase && userId && projectId),
  });
  const {
    data: tasks = [],
    isPending,
    isError,
    isFetching,
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
  });
  const queryClient = useQueryClient();
  const search = useTaskUiStore((state) => state.search);
  const statusFilter = useTaskUiStore((state) => state.statusFilter);
  const openTask = useTaskUiStore((state) => state.openTask);
  const selectedTaskId = useTaskUiStore((state) => state.selectedTaskId);
  const closeTask = useTaskUiStore((state) => state.closeTask);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const refreshTasks = () =>
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const manuallyRefreshTasks = async () => {
    setActionNotice("");
    setActionError("");
    try {
      await queryClient.refetchQueries(
        { queryKey: ["tasks"], type: "active" },
        { throwOnError: true },
      );
      setActionNotice("任务和已打开的详情已更新。");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "刷新失败，请重试。");
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

  const visibleTasks = filterTasks(tasks, search, statusFilter);
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
    adminQuery.data === true ||
    roleQuery.data === "owner" ||
    (roleQuery.data === "member" && task.createdBy === userId);

  return (
    <main className="kanban-page">
      <header className="kanban-header">
        <div>
          <p className="eyebrow">PROJECT TASKS / {projectQuery.data.name}</p>
          <h1>任务协作看板</h1>
          <Button onClick={() => navigate("/projects")}>返回我的项目</Button>
          <p className="project-intro">
            把项目的下一步放在一起，清晰推进每一项工作。
          </p>
          <ProjectInviteButton key={projectId} projectId={projectId} />
        </div>
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
            新建任务
          </label>
          <div className="task-create-controls">
            <Input
              id="new-task-title"
              className="task-create-input"
              value={newTaskTitle}
              maxLength={120}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="例如：整理本周迭代计划"
              aria-label="新任务标题"
            />
            <Button
              className="kanban-create-button"
              type="primary"
              htmlType="submit"
              loading={createMutation.isPending}
              disabled={!newTaskTitle.trim()}
            >
              创建任务
            </Button>
          </div>
        </form>
      </header>
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
        <Alert className="board-alert" type="success" showIcon closable
          title={actionNotice} onClose={() => setActionNotice("")} />
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
      <div className="board-refresh">
        <span>页面可见时约每 10 秒更新；切回页面也会刷新。</span>
        <Button onClick={() => void manuallyRefreshTasks()} loading={isFetching}>刷新任务</Button>
      </div>
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
        <section className="kanban-board" aria-label="任务看板">
          {columns.map((column) => (
            <section
              className={`kanban-column kanban-column--${column.status}`}
              key={column.status}
              aria-label={column.title}
            >
              <div className="kanban-column__header">
                <h2>{column.title}</h2>
                <span>{column.tasks.length}</span>
              </div>
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={(id) =>
                    updateMutation.mutate({ id, changes: { status: "done" } })
                  }
                  onStatusChange={(id, status) =>
                    updateMutation.mutate({ id, changes: { status } })
                  }
                  onEdit={setEditingTask}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  canDelete={canDeleteTask(task)}
                  onOpenDetails={openTask}
                  isThisTaskPending={isPendingTask(task.id)}
                />
              ))}
              {column.tasks.length === 0 && (
                <p className="kanban-empty">此状态暂无任务</p>
              )}
            </section>
          ))}
        </section>
      )}
      <TaskDetailPanel projectId={projectId} userId={userId!} />
      <Modal
        title="编辑任务"
        open={editingTask !== null}
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
    <main className="simple-page">
      <p className="eyebrow">PROJECT TASKS</p>
      <h1>{showAll ? "全部项目" : "我的项目"}</h1>
      <Link to="/settings">设置我的显示名称 →</Link>
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
        <>
          <section
            className="project-list"
            aria-labelledby="project-list-title"
          >
            <h2 id="project-list-title">{showAll ? "全部项目" : "我的项目"}</h2>
            {projects.length === 0 ? (
              <p>{showAll ? "目前没有项目。" : "还没有创建或加入的项目。可新建项目，或向项目组长获取邀请链接。"}</p>
            ) : (
              projects.map((project) => (
                <Link
                  className="project-list__item"
                  key={project.id}
                  to={`/projects/${project.id}/board`}
                >
                  <span>
                    {project.name}{"role" in project && project.role === "owner" ? " (owner)" : ""}
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))
            )}
          </section>
          {!showAll && <form
            className="project-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (projectName.trim())
                createProjectMutation.mutate(projectName.trim());
            }}
          >
            <h2>新建项目</h2>
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
          </form>}
        </>
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
      <main className="simple-page">
        <h1>设置</h1>
        <Alert type="info" showIcon message="演示模式下不能保存资料" />
      </main>
    );
  return (
    <main className="simple-page">
      <p className="eyebrow">PREFERENCES</p>
      <h1>个人资料</h1>
      <p>负责人姓名保存在个人资料中，任务只关联负责人账号。</p>
      {profileQuery.isPending && <p>正在加载资料……</p>}
      {profileQuery.isError && (
        <Alert
          type="error"
          showIcon
          message="资料加载失败"
          description={profileQuery.error.message}
        />
      )}
      {saveMutation.isError && (
        <Alert
          className="project-alert"
          type="error"
          showIcon
          message="保存失败"
          description={saveMutation.error.message}
        />
      )}
      <form
        className="project-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (currentDisplayName.trim())
            saveMutation.mutate(currentDisplayName);
        }}
      >
        <label htmlFor="profile-display-name">显示名称</label>
        <Input
          id="profile-display-name"
          value={currentDisplayName}
          maxLength={100}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="输入负责人显示名称"
        />
        <Button
          type="primary"
          htmlType="submit"
          loading={saveMutation.isPending}
          disabled={!currentDisplayName.trim()}
        >
          保存名称
        </Button>
      </form>
      {saveMutation.isSuccess && (
        <Alert type="success" showIcon message="名称已保存" />
      )}
      <Link to="/projects">返回项目</Link>
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
