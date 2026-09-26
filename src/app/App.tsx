import "./App.css";
import { useState } from "react";
import type { Task } from "../features/tasks/types";
import { TaskCard } from "../features/tasks/components/TaskCard";

function App() {
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

  function handleCompleteTask(taskId: number) {
    setTasks((currentTasks) =>
      // 在这里返回一个新数组
      currentTasks.map((task) =>
        task.id === taskId ? { ...task, status: "done" } : task,
      ),
    );
  }

  const todoTasks = tasks.filter((task) => task.status === "todo");
  const doingTasks = tasks.filter((task) => task.status === "doing");
  const doneTasks = tasks.filter((task) => task.status === "done");

  return (
    <main className="kanban-page">
      <header className="kanban-header">
        <div>
          <p className="eyebrow">React Kanban</p>
          <h1>任务协作看板</h1>
          <p className="project-intro">
            面向小团队的任务协作 Web
            应用，用看板集中管理项目任务，并展示待处理、进行中和已完成三种工作状态。
          </p>
        </div>
        <button type="button">新建任务</button>
      </header>

      <section className="kanban-board">
        <section className="kanban-column">
          <h2>待办</h2>
          {todoTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleCompleteTask}
            />
          ))}
        </section>
        <section className="kanban-column">
          <h2>进行中</h2>
          {doingTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleCompleteTask}
            />
          ))}
        </section>
        <section className="kanban-column">
          <h2>已完成</h2>
          {doneTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleCompleteTask}
            />
          ))}
        </section>
      </section>
    </main>
  );
}

export default App;
