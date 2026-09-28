import "./App.css";
import { useState } from "react";
import type { Task } from "../features/tasks/types";
import { TaskCard } from "../features/tasks/components/TaskCard";
import { Button, Input, Select } from "antd";
import { Routes, Route } from "react-router-dom";
import { Link, Navigate, useParams } from "react-router-dom";

type TaskStatusFilter = "all" | Task["status"];

function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: 1,
      title: "梳理看板需求",
      status: "todo",
      priority: "high",
      assignee: "张三",
    },
    {
      id: 2,
      title: "完成静态页面",
      status: "doing",
      priority: "medium",
      assignee: "李四",
    },
    {
      id: 3,
      title: "初始化 Git 仓库",
      status: "done",
      priority: "low",
      assignee: "王五",
    },
    {
      id: 4,
      title: "编写 README",
      status: "todo",
      priority: "medium",
      assignee: "赵六",
    },
    {
      id: 5,
      title: "设计数据库结构",
      status: "doing",
      priority: "high",
      assignee: "孙七",
    },
  ]);

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  let projectId = useParams().projectId;

  function handleCompleteTask(taskId: number) {
    setTasks((currentTasks) =>
      // 在这里返回一个新数组
      currentTasks.map((task) =>
        task.id === taskId ? { ...task, status: "done" } : task,
      ),
    );
  }

  const visibleTasks = tasks.filter((task) => {
    const matchesSearch = task.title
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesStatus =
      statusFilter === "all" || task.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const todoTasks = visibleTasks.filter((task) => task.status === "todo");
  const doingTasks = visibleTasks.filter((task) => task.status === "doing");
  const doneTasks = visibleTasks.filter((task) => task.status === "done");

  return (
    <main className="kanban-page">
      <header className="kanban-header">
        <div>
          <p className="eyebrow">React Kanban</p>
          <h1>任务协作看板</h1>
          <p>当前项目ID:{projectId}</p>
          <p className="project-intro">
            面向小团队的任务协作 Web
            应用，用看板集中管理项目任务，并展示待处理、进行中和已完成三种工作状态。
          </p>
        </div>
        <Button className="kanban-create-button" type="primary">
          新建任务
        </Button>
      </header>

      <section className="kanban-toolbar" aria-label="任务筛选">
        <div className="kanban-toolbar__controls">
          <Input
            className="task-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="搜索任务标题"
            aria-label="搜索任务标题"
          />
          <Select<TaskStatusFilter>
            className="status-filter"
            aria-label="按任务状态筛选"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: "全部状态", value: "all" },
              { label: "待处理", value: "todo" },
              { label: "进行中", value: "doing" },
              { label: "已完成", value: "done" },
            ]}
          />
        </div>
        <p className="kanban-result-count">
          显示 <strong>{visibleTasks.length}</strong> 条任务
        </p>
      </section>

      <section className="kanban-board">
        <section className="kanban-column kanban-column--todo">
          <div className="kanban-column__header">
            <h2>待处理</h2>
            <span>{todoTasks.length}</span>
          </div>
          {todoTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleCompleteTask}
            />
          ))}
          {todoTasks.length === 0 && (
            <p className="kanban-empty">这里暂时没有任务</p>
          )}
        </section>
        <section className="kanban-column kanban-column--doing">
          <div className="kanban-column__header">
            <h2>进行中</h2>
            <span>{doingTasks.length}</span>
          </div>
          {doingTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleCompleteTask}
            />
          ))}
          {doingTasks.length === 0 && (
            <p className="kanban-empty">这里暂时没有任务</p>
          )}
        </section>
        <section className="kanban-column kanban-column--done">
          <div className="kanban-column__header">
            <h2>已完成</h2>
            <span>{doneTasks.length}</span>
          </div>
          {doneTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleCompleteTask}
            />
          ))}
          {doneTasks.length === 0 && (
            <p className="kanban-empty">这里暂时没有任务</p>
          )}
        </section>
      </section>
    </main>
  );
}

function ProjectsPage() {
  return (
    <main>
      <h1>项目列表</h1>
      <p>这里是项目列表页面</p>
      <Link to="/projects/p1/board">打开p1看板</Link>
      <br />
      <Link to="/settings">打开设置</Link>
      <br />
      <a href="/projects/p1/board">打开p1看板(a标签)</a>
    </main>
  );
}
function SettingsPage() {
  return (
    <main>
      <h1>设置</h1>
      <p>设置功能暂未开放</p>
    </main>
  );
}
function App() {
  return (
    <Routes>
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:projectId/board" element={<BoardPage />} />
      <Route path="/settings" element={<SettingsPage />} />

      {/* 可选：访问根路径时送到项目列表 */}
      <Route path="/" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}

export default App;
