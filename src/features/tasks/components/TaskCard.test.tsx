import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";

const task: Task = { id: "task-7", title: "Write tests", status: "doing", priority: "medium", assignee: "Mina", assigneeUserId: null, createdBy: "member-id" };

describe("TaskCard", () => {
  it("calls the completion callback with this task ID", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<TaskCard task={task} onComplete={onComplete} onStatusChange={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onOpenDetails={vi.fn()} isThisTaskPending={false} canDelete={false} />);
    await user.click(screen.getByRole("button", { name: /完\s*成/ }));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("task-7");
  });
  it("shows deletion only when the board grants it", () => {
    const props = { task, onComplete: vi.fn(), onStatusChange: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onOpenDetails: vi.fn(), isThisTaskPending: false };
    const view = render(<TaskCard {...props} canDelete={false} />);
    expect(screen.queryByRole("button", { name: /删\s*除/ })).not.toBeInTheDocument();
    view.rerender(<TaskCard {...props} canDelete />);
    expect(screen.getByRole("button", { name: /删\s*除/ })).toBeInTheDocument();
  });
});
