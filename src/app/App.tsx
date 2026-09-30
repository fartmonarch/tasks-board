import "./App.css";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Modal, Select } from "antd";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { TaskCard } from "../features/tasks/components/TaskCard";
import { TaskDetailPanel } from "../features/tasks/components/TaskDetailPanel";
import { TaskToolbar } from "../features/tasks/components/TaskToolbar";
import { createTask, deleteTask, getTasks, updateTask } from "../features/tasks/api/taskApi";
import { createProject, createTeam, getProjectMembers, getWorkspace } from "../features/projects/api/projectApi";
import { useAuthSession } from "../features/auth/AuthGate";
import { supabase } from "../lib/supabase";
import { useTaskUiStore } from "../features/tasks/store/taskUiStore";
import { filterTasks } from "../features/tasks/utils/filterTasks";
import type { Task } from "../features/tasks/types";

function BoardPage() {
  const { projectId } = useParams();
  const session = useAuthSession();
  const userId = session?.user.id;
  const { data: tasks = [], isPending, isError, error } = useQuery({ queryKey: ["tasks", userId, projectId], queryFn: () => getTasks(projectId!), enabled: Boolean(supabase && userId && projectId) });
  const membersQuery = useQuery({ queryKey: ["projectMembers", userId, projectId], queryFn: () => getProjectMembers(projectId!), enabled: Boolean(supabase && userId && projectId) });
  const queryClient = useQueryClient();
  const search = useTaskUiStore((state) => state.search);
  const statusFilter = useTaskUiStore((state) => state.statusFilter);
  const openTask = useTaskUiStore((state) => state.openTask);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [actionError, setActionError] = useState("");
  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ["tasks", userId, projectId] });
  const createMutation = useMutation({ mutationFn: (title: string) => createTask(projectId!, title), onSuccess: async () => { setNewTaskTitle(""); setActionError(""); await refreshTasks(); }, onError: (e) => setActionError(e.message) });
  const updateMutation = useMutation({ mutationFn: ({ id, changes }: { id: string; changes: Partial<Pick<Task, "title" | "status" | "priority" | "assigneeUserId">> }) => updateTask(projectId!, id, changes), onSuccess: async () => { setEditingTask(null); setActionError(""); await refreshTasks(); }, onError: (e) => setActionError(e.message) });
  const deleteMutation = useMutation({ mutationFn: (id: string) => deleteTask(projectId!, id), onSuccess: async () => { setActionError(""); await refreshTasks(); }, onError: (e) => setActionError(e.message) });

  if (!supabase) return <main className="simple-page"><h1>演示看板</h1><Alert type="info" showIcon message="演示模式暂不连接数据库" description="登录 Supabase 后即可在项目看板中保存真实任务。" /></main>;
  if (!projectId) return <Navigate to="/projects" replace />;

  if (isPending) return <main className="page-state">正在加载任务……</main>;
  if (isError) return <main className="page-state"><Alert type="error" showIcon message="任务加载失败" description={error.message} action={<Button onClick={() => void refreshTasks()}>重试</Button>} /></main>;

  const visibleTasks = filterTasks(tasks, search, statusFilter);
  const columns: Array<{ status: Task["status"]; title: string; tasks: Task[] }> = [
    { status: "todo", title: "待处理", tasks: visibleTasks.filter((task) => task.status === "todo") },
    { status: "doing", title: "进行中", tasks: visibleTasks.filter((task) => task.status === "doing") },
    { status: "done", title: "已完成", tasks: visibleTasks.filter((task) => task.status === "done") },
  ];
  const isPendingTask = (id: string) => (updateMutation.isPending && updateMutation.variables.id === id) || (deleteMutation.isPending && deleteMutation.variables === id);

  return <main className="kanban-page">
    <header className="kanban-header">
      <div><p className="eyebrow">TEAM WORKSPACE / PROJECT {projectId}</p><h1>任务协作看板</h1><p className="project-intro">把团队的下一步放在一起，清晰推进每一项工作。</p></div>
      <form className="task-create-form" onSubmit={(event) => { event.preventDefault(); const title = newTaskTitle.trim(); if (title && !createMutation.isPending) createMutation.mutate(title); }}>
        <label className="task-create-label" htmlFor="new-task-title">新建任务</label><div className="task-create-controls"><Input id="new-task-title" className="task-create-input" value={newTaskTitle} maxLength={120} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="例如：整理本周迭代计划" aria-label="新任务标题" />
          <Button className="kanban-create-button" type="primary" htmlType="submit" loading={createMutation.isPending} disabled={!newTaskTitle.trim()}>创建任务</Button></div>
      </form>
    </header>
    {actionError && <Alert className="board-alert" type="error" showIcon closable message="操作未完成" description={actionError} onClose={() => setActionError("")} />}
    <TaskToolbar visibleTasksLength={visibleTasks.length} />
    {tasks.length === 0 ? <section className="board-welcome"><span className="board-welcome__mark">✳</span><h2>从一条任务开始</h2><p>创建第一条任务，团队就可以开始安排工作了。</p></section> : visibleTasks.length === 0 ? <section className="board-welcome"><h2>没有匹配的任务</h2><p>试试其他关键词或筛选条件。</p></section> : <section className="kanban-board" aria-label="任务看板">
      {columns.map((column) => <section className={`kanban-column kanban-column--${column.status}`} key={column.status} aria-label={column.title}>
        <div className="kanban-column__header"><h2>{column.title}</h2><span>{column.tasks.length}</span></div>
        {column.tasks.map((task) => <TaskCard key={task.id} task={task} onComplete={(id) => updateMutation.mutate({ id, changes: { status: "done" } })} onStatusChange={(id, status) => updateMutation.mutate({ id, changes: { status } })} onEdit={setEditingTask} onDelete={(id) => deleteMutation.mutate(id)} onOpenDetails={openTask} isThisTaskPending={isPendingTask(task.id)} />)}
        {column.tasks.length === 0 && <p className="kanban-empty">此状态暂无任务</p>}
      </section>)}
    </section>}
    <TaskDetailPanel projectId={projectId} userId={userId!} />
    <Modal title="编辑任务" open={editingTask !== null} okText="保存修改" cancelText="取消" confirmLoading={updateMutation.isPending} okButtonProps={{ disabled: !editingTask?.title.trim() }} onCancel={() => setEditingTask(null)} onOk={() => { if (editingTask?.title.trim()) updateMutation.mutate({ id: editingTask.id, changes: { title: editingTask.title.trim(), priority: editingTask.priority, assigneeUserId: editingTask.assigneeUserId } }); }}>
      {editingTask && <div className="task-edit-form"><label>标题<Input autoFocus maxLength={120} value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} /></label><label>优先级<Select value={editingTask.priority} onChange={(priority) => setEditingTask({ ...editingTask, priority })} options={[{ label: "高", value: "high" }, { label: "中", value: "medium" }, { label: "低", value: "low" }]} /></label><label>负责人<Select allowClear placeholder="未分配" value={editingTask.assigneeUserId ?? undefined} onChange={(assigneeUserId) => setEditingTask({ ...editingTask, assigneeUserId: assigneeUserId ?? null })} options={(membersQuery.data ?? []).map((member) => ({ label: member.name, value: member.userId }))} /></label></div>}
    </Modal>
  </main>;
}

function ProjectsPage() {
  const session = useAuthSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const workspaceQuery = useQuery({ queryKey: ["workspace", "projects", userId], queryFn: getWorkspace, enabled: Boolean(supabase && userId) });
  const refreshWorkspace = () => queryClient.invalidateQueries({ queryKey: ["workspace", "projects", userId] });
  const createTeamMutation = useMutation({ mutationFn: createTeam, onSuccess: async () => { setTeamName(""); await refreshWorkspace(); } });
  const createProjectMutation = useMutation({ mutationFn: ({ teamId, name }: { teamId: string; name: string }) => createProject(teamId, name), onSuccess: async () => { setProjectName(""); await refreshWorkspace(); }, onSettled: refreshWorkspace });

  if (!supabase) return <main className="simple-page"><p className="eyebrow">TEAM WORKSPACE</p><h1>项目</h1><Alert type="info" showIcon message="配置 Supabase 后可创建真实项目" description="当前为本地演示模式。" /><Link to="/projects/p1/board">打开演示看板 →</Link></main>;

  const teams = workspaceQuery.data?.teams ?? [];
  const adminTeams = teams.filter((team) => team.role === "admin");
  const projectTeamId = selectedTeamId || adminTeams[0]?.id || "";
  const operationError = createTeamMutation.error?.message ?? createProjectMutation.error?.message;

  return <main className="simple-page">
    <p className="eyebrow">TEAM WORKSPACE</p><h1>项目</h1>
    {workspaceQuery.isPending && <p>正在加载项目……</p>}
    {workspaceQuery.isError && <Alert type="error" showIcon message="项目加载失败" description={workspaceQuery.error.message} action={<Button onClick={() => void workspaceQuery.refetch()}>重试</Button>} />}
    {operationError && <Alert className="project-alert" type="error" showIcon closable message="操作未完成" description={operationError} />}
    {workspaceQuery.data && <>
      <section className="project-list" aria-labelledby="project-list-title">
        <h2 id="project-list-title">我的项目</h2>
        {workspaceQuery.data.projects.length === 0 ? <p>还没有可访问的项目。</p> : workspaceQuery.data.projects.map((project) => <Link className="project-list__item" key={project.id} to={`/projects/${project.id}/board`}><span>{project.name}</span><span aria-hidden="true">→</span></Link>)}
      </section>
      {teams.length === 0 && <form className="project-form" onSubmit={(event) => { event.preventDefault(); const name = teamName.trim(); if (name) createTeamMutation.mutate(name); }}>
        <h2>创建团队</h2><label htmlFor="new-team-name">团队名称</label><Input id="new-team-name" value={teamName} maxLength={100} onChange={(event) => setTeamName(event.target.value)} placeholder="例如：产品研发组" />
        <Button type="primary" htmlType="submit" loading={createTeamMutation.isPending} disabled={!teamName.trim()}>创建团队</Button>
      </form>}
      {adminTeams.length > 0 && <form className="project-form" onSubmit={(event) => { event.preventDefault(); if (projectTeamId && projectName.trim()) createProjectMutation.mutate({ teamId: projectTeamId, name: projectName.trim() }); }}>
        <h2>新建项目</h2><label htmlFor="project-team">所属团队</label><Select id="project-team" value={projectTeamId} onChange={setSelectedTeamId} options={adminTeams.map((team) => ({ label: team.name, value: team.id }))} />
        <label htmlFor="new-project-name">项目名称</label><Input id="new-project-name" value={projectName} maxLength={120} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：产品迭代" />
        <Button type="primary" htmlType="submit" loading={createProjectMutation.isPending} disabled={!projectName.trim()}>创建项目</Button>
      </form>}
    </>}
  </main>;
}
function SettingsPage() { return <main className="simple-page"><p className="eyebrow">PREFERENCES</p><h1>设置</h1><p>设置功能将在后续阶段开放。</p><Link to="/projects">返回项目</Link></main>; }
function App() { return <Routes><Route path="/projects" element={<ProjectsPage />} /><Route path="/projects/:projectId/board" element={<BoardPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/" element={<Navigate to="/projects" replace />} /></Routes>; }
export default App;
