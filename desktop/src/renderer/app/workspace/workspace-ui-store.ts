import { create } from "zustand";

export type SidebarViewMode = "mixed" | "project" | "simple";

interface WorkspaceUiState {
  setSidebarViewMode: (viewMode: SidebarViewMode) => void;
  sidebarViewMode: SidebarViewMode;
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  setSidebarViewMode: (sidebarViewMode) => set({ sidebarViewMode }),
  sidebarViewMode: "simple",
}));
