import { create } from "zustand";

const rightSidebarWidthStorageKey = "angel-engine.right-sidebar-width";
export const defaultWorkspaceRightSidebarWidth = 288;
export const minWorkspaceRightSidebarWidth = 240;
export const maxWorkspaceRightSidebarWidth = 520;
const initialRightSidebarWidth = readRightSidebarWidth();

export type SidebarChatDateGroupKey =
  | "dayBeforeYesterday"
  | "older"
  | "pinned"
  | "previousMonth"
  | "previousWeek"
  | "today"
  | "yesterday";

interface WorkspaceUiState {
  browserUrl: string;
  collapsedChatDateGroupKeys: Set<SidebarChatDateGroupKey>;
  collapsedWorktreeGroupKeys: Set<string>;
  expandedProjectIds: Set<string>;
  rightSidebarOpen: boolean;
  rightSidebarWidth: number;
  setBrowserUrl: (browserUrl: string) => void;
  setRightSidebarOpen: (rightSidebarOpen: boolean) => void;
  setRightSidebarWidth: (rightSidebarWidth: number) => void;
  setSidebarOpen: (sidebarOpen: boolean) => void;
  setSidebarOpenMobile: (sidebarOpenMobile: boolean) => void;
  sidebarOpen: boolean;
  sidebarOpenMobile: boolean;
  sidebarProjectIds: Set<string>;
  sidebarProjectIdsWithChats: Set<string>;
  syncSidebarProjects: (
    projectIds: string[],
    projectIdsWithChats: string[],
  ) => void;
  toggleRightSidebar: () => void;
  toggleSidebarChatDateGroup: (groupKey: SidebarChatDateGroupKey) => void;
  toggleSidebarProject: (projectId: string) => void;
  toggleSidebarWorktreeGroup: (groupKey: string) => void;
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  browserUrl: defaultBrowserUrl,
  collapsedChatDateGroupKeys: new Set(),
  collapsedWorktreeGroupKeys: new Set(),
  expandedProjectIds: new Set(),
  rightSidebarOpen: true,
  rightSidebarWidth: initialRightSidebarWidth,
  setRightSidebarOpen: (rightSidebarOpen) => set({ rightSidebarOpen }),
  setRightSidebarWidth: (rightSidebarWidth) => {
    const nextRightSidebarWidth =
      clampWorkspaceRightSidebarWidth(rightSidebarWidth);
    writeRightSidebarWidth(nextRightSidebarWidth);
    set({ rightSidebarWidth: nextRightSidebarWidth });
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarOpenMobile: (sidebarOpenMobile) => set({ sidebarOpenMobile }),
  sidebarOpen: true,
  sidebarOpenMobile: false,
  sidebarProjectIds: new Set(),
  sidebarProjectIdsWithChats: new Set(),
  syncSidebarProjects: (projectIds, projectIdsWithChats) =>
    set((current) => {
      const nextProjectIds = new Set(projectIds);
      const nextProjectIdsWithChats = new Set(projectIdsWithChats);
      const currentProjectIds = current.sidebarProjectIds;
      const currentProjectIdsWithChats = current.sidebarProjectIdsWithChats;
      if (
        setsEqual(currentProjectIds, nextProjectIds) &&
        setsEqual(currentProjectIdsWithChats, nextProjectIdsWithChats)
      ) {
        return current;
      }

      const nextExpandedProjectIds = new Set(current.expandedProjectIds);
      for (const projectId of currentProjectIds) {
        if (!nextProjectIds.has(projectId)) {
          nextExpandedProjectIds.delete(projectId);
        }
      }
      for (const projectId of nextProjectIds) {
        if (
          nextProjectIdsWithChats.has(projectId) &&
          (!currentProjectIds.has(projectId) ||
            !currentProjectIdsWithChats.has(projectId))
        ) {
          nextExpandedProjectIds.add(projectId);
        }
      }

      return {
        expandedProjectIds: nextExpandedProjectIds,
        sidebarProjectIds: nextProjectIds,
        sidebarProjectIdsWithChats: nextProjectIdsWithChats,
      };
    }),
  toggleSidebarChatDateGroup: (groupKey) =>
    set((current) => {
      const collapsedChatDateGroupKeys = new Set(
        current.collapsedChatDateGroupKeys,
      );
      if (collapsedChatDateGroupKeys.has(groupKey)) {
        collapsedChatDateGroupKeys.delete(groupKey);
      } else {
        collapsedChatDateGroupKeys.add(groupKey);
      }
      return { collapsedChatDateGroupKeys };
    }),
  toggleRightSidebar: () =>
    set((current) => ({ rightSidebarOpen: !current.rightSidebarOpen })),
  toggleSidebarProject: (projectId) =>
    set((current) => {
      const expandedProjectIds = new Set(current.expandedProjectIds);
      if (expandedProjectIds.has(projectId)) {
        expandedProjectIds.delete(projectId);
      } else {
        expandedProjectIds.add(projectId);
      }
      return { expandedProjectIds };
    }),
  toggleSidebarWorktreeGroup: (groupKey) =>
    set((current) => {
      const collapsedWorktreeGroupKeys = new Set(
        current.collapsedWorktreeGroupKeys,
      );
      if (collapsedWorktreeGroupKeys.has(groupKey)) {
        collapsedWorktreeGroupKeys.delete(groupKey);
      } else {
        collapsedWorktreeGroupKeys.add(groupKey);
      }
      return { collapsedWorktreeGroupKeys };
    }),
}));

function readRightSidebarWidth() {
  try {
    if (typeof window === "undefined") return defaultWorkspaceRightSidebarWidth;
    const value = window.localStorage.getItem(rightSidebarWidthStorageKey);
    return value === null
      ? defaultWorkspaceRightSidebarWidth
      : clampWorkspaceRightSidebarWidth(Number(value));
  } catch {
    return defaultWorkspaceRightSidebarWidth;
  }
}

function writeRightSidebarWidth(rightSidebarWidth: number) {
  window.localStorage.setItem(
    rightSidebarWidthStorageKey,
    String(clampWorkspaceRightSidebarWidth(rightSidebarWidth)),
  );
}

export function clampWorkspaceRightSidebarWidth(value: unknown) {
  return clampNumber(
    value,
    defaultWorkspaceRightSidebarWidth,
    minWorkspaceRightSidebarWidth,
    maxWorkspaceRightSidebarWidth,
  );
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}
