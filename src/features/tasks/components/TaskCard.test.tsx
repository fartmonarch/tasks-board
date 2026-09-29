import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";

const task: Task = { id: 7, title: "Write tests", status: "doing", priority: "medium", assignee: "Mina" };

describe("TaskCard", () => {
  it("calls the completion callback with this task ID", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<TaskCard task={task} onComplete={onComplete} onStatusChange={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onOpenDetails={vi.fn()} isThisTaskPending={false} />);
    await user.click(screen.getByRole("button", { name: /完\s*成/ }));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(7);
  });
});
