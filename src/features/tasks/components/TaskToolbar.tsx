import { useTaskUiStore } from "../store/taskUiStore";
import { Input, Select } from "antd";
import type { TaskStatusFilter } from "../store/taskUiStore";

type TaskToolbarProps = {
  visibleTasksLength: number;
};

export function TaskToolbar(visibleTasksLength: TaskToolbarProps) {
  const search = useTaskUiStore((state) => state.search);
  const setSearch = useTaskUiStore((state) => state.setSearch);
  const statusFilter = useTaskUiStore((state) => state.statusFilter);
  const setStatusFilter = useTaskUiStore((state) => state.setStatusFilter);

  return (
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
        显示 <strong>{visibleTasksLength.visibleTasksLength}</strong> 条任务
      </p>
    </section>
  );
}
