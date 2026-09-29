import "./App.css";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Modal, Select } from "antd";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { TaskCard } from "../features/tasks/components/TaskCard";
import { TaskDetailPanel } from "../features/tasks/components/TaskDetailPanel";
import { TaskToolbar } from "../features/tasks/components/TaskToolbar";
import { createTask, deleteTask, getTasks, updateTask } from "../features/tasks/api/taskApi";
import { useTaskUiStore } from "../features/tasks/store/taskUiStore";
import { filterTasks } from "../features/tasks/utils/filterTasks";
import type { Task } from "../features/tasks/types";

function BoardPage() {
  const { projectId } = useParams();
  const { data: tasks = [], isPending, isError, error } = useQuery({ queryKey: ["tasks"], queryFn: getTasks });
  const queryClient = useQueryClient();
  const search = useTaskUiStore((state) => state.search);
  const statusFilter = useTaskUiStore((state) => state.statusFilter);
  const openTask = useTaskUiStore((state) => state.openTask);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [actionError, setActionError] = useState("");
  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const createMutation = useMutation({ mutationFn: createTask, onSuccess: async () => { setNewTaskTitle(""); setActionError(""); await refreshTasks(); }, onError: (e) => setActionError(e.message) });
  const updateMutation = useMutation({ mutationFn: ({ id, changes }: { id: number; changes: Partial<Pick<Task, "title" | "status" | "priority" | "assignee">> }) => updateTask(id, changes), onSuccess: async () => { setEditingTask(null); setActionError(""); await refreshTasks(); }, onError: (e) => setActionError(e.message) });
  const deleteMutation = useMutation({ mutationFn: deleteTask, onSuccess: async () => { setActionError(""); await refreshTasks(); }, onError: (e) => setActionError(e.message) });

  if (isPending) return <main className="page-state">正在加载任务……</main>;
  if (isError) return <main className="page-state"><Alert type="error" showIcon message="任务加载失败" description={error.message} action={<Button onClick={() => void refreshTasks()}>重试</Button>} /></main>;

  const visibleTasks = filterTasks(tasks, search, statusFilter);
  const columns: Array<{ status: Task["status"]; title: string; tasks: Task[] }> = [
    { status: "todo", title: "待处理", tasks: visibleTasks.filter((task) => task.status === "todo") },
    { status: "doing", title: "进行中", tasks: visibleTasks.filter((task) => task.status === "doing") },
    { status: "done", title: "已完成", tasks: visibleTasks.filter((task) => task.status === "done") },
  ];
  const isPendingTask = (id: number) => (updateMutation.isPending && updateMutation.variables.id === id) || (deleteMutation.isPending && deleteMutation.variables === id);

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
    <TaskDetailPanel />
    <Modal title="编辑任务" open={editingTask !== null} okText="保存修改" cancelText="取消" confirmLoading={updateMutation.isPending} okButtonProps={{ disabled: !editingTask?.title.trim() }} onCancel={() => setEditingTask(null)} onOk={() => { if (editingTask?.title.trim()) updateMutation.mutate({ id: editingTask.id, changes: { title: editingTask.title.trim(), priority: editingTask.priority, assignee: editingTask.assignee.trim() || "未分配" } }); }}>
      {editingTask && <div className="task-edit-form"><label>标题<Input autoFocus maxLength={120} value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} /></label><label>优先级<Select value={editingTask.priority} onChange={(priority) => setEditingTask({ ...editingTask, priority })} options={[{ label: "高", value: "high" }, { label: "中", value: "medium" }, { label: "低", value: "low" }]} /></label><label>负责人<Input maxLength={60} value={editingTask.assignee} onChange={(e) => setEditingTask({ ...editingTask, assignee: e.target.value })} /></label></div>}
    </Modal>
  </main>;
}

function ProjectsPage() { return <main className="simple-page"><p className="eyebrow">TEAM WORKSPACE</p><h1>项目</h1><p>打开看板继续推进团队工作。</p><Link to="/projects/p1/board">打开项目看板 →</Link></main>; }
function SettingsPage() { return <main className="simple-page"><p className="eyebrow">PREFERENCES</p><h1>设置</h1><p>设置功能将在后续阶段开放。</p><Link to="/projects">返回项目</Link></main>; }
function App() { return <Routes><Route path="/projects" element={<ProjectsPage />} /><Route path="/projects/:projectId/board" element={<BoardPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/" element={<Navigate to="/projects" replace />} /></Routes>; }
export default App;
