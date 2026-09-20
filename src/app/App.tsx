import "./App.css";

type Task = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
};

function TaskCard({ task }: { task: Task }) {
  return <div>{task.title}</div>;
}

function App() {
  const tasks: Task[] = [
    { id: "1", title: "梳理看板需求", status: "todo" },
    { id: "2", title: "完成静态页面", status: "doing" },
    { id: "3", title: "初始化 Git 仓库", status: "done" },
  ];

  return (
    <>
      <main className="kanban-page">
        <header className="kanban-header">
          <h1>React 看板</h1>
          <h2>任务协作看板</h2>
          <button>新建任务</button>
        </header>

        <section className="kanban-board">
          <section className="kanban-column">
            <h2>待办</h2>
            <TaskCard task={tasks[0]} />
          </section>
          <section className="kanban-column">
            <h2>进行中</h2>
            <TaskCard task={tasks[1]} />
          </section>
          <section className="kanban-column">
            <h2>已完成</h2>
            <TaskCard task={tasks[2]} />
          </section>
        </section>
      </main>
    </>
  );
}

export default App;
