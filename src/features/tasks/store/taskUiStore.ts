import { create } from "zustand";
import type { Task } from "../types";

export type TaskStatusFilter = "all" | Task["status"];

type TaskUiState = {
  search: string;
  statusFilter: TaskStatusFilter;
  selectedTaskId: string | null;
  setSearch: (value: string) => void;
  setStatusFilter: (value: TaskStatusFilter) => void;
  openTask: (taskId: string) => void;
  closeTask: () => void;
};

export const useTaskUiStore = create<TaskUiState>((set) => ({
  search: "",
  statusFilter: "all",
  selectedTaskId: null,
  setSearch: (value) => {
    // 在这里调用 set 更新 search
    set((state) => ({ ...state, search: value }));
  },
  setStatusFilter: (value) => {
    // 在这里调用 set 更新 statusFilter
    set((state) => ({ ...state, statusFilter: value }));
  },
  openTask: (taskId) => set({ selectedTaskId: taskId }),
  closeTask: () => set({ selectedTaskId: null }),
}));
