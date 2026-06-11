import { create } from "zustand";

export type WorkspaceMode = "chat" | "work";

const workspaceModeStorageKey = "angel-engine.workspace-mode";
const rightSidebarWidthStorageKey = "angel-engine.right-sidebar-width";
const defaultBrowserUrl = "about:blank";
const defaultRightSidebarWidth = 288;
const minRightSidebarWidth = 240;
const maxRightSidebarWidth = 520;
const initialWorkspaceMode = readWorkspaceMode();
const initialRightSidebarWidth = readRightSidebarWidth();

export type SidebarChatDateGroupKey =
  | "dayBeforeYesterday"
  | "older"
  | "previousMonth"
  | "previousWeek"
  | "today"
  | "yesterday";

interface WorkspaceUiState {
  browserUrl: string;
  collapsedChatDateGroupKeys: Set<SidebarChatDateGroupKey>;
  expandedProjectIds: Set<string>;
  rightSidebarOpen: boolean;
  rightSidebarWidth: number;
  setBrowserUrl: (browserUrl: string) => void;
  setRightSidebarOpen: (rightSidebarOpen: boolean) => void;
  setRightSidebarWidth: (rightSidebarWidth: number) => void;
  setSidebarOpen: (sidebarOpen: boolean) => void;
  setSidebarOpenMobile: (sidebarOpenMobile: boolean) => void;
  setWorkspaceMode: (workspaceMode: WorkspaceMode) => void;
  sidebarOpen: boolean;
  sidebarOpenMobile: boolean;
  sidebarProjectIds: Set<string>;
  syncSidebarProjects: (projectIds: string[]) => void;
  toggleRightSidebar: () => void;
  toggleSidebarChatDateGroup: (groupKey: SidebarChatDateGroupKey) => void;
  toggleSidebarProject: (projectId: string) => void;
  workspaceMode: WorkspaceMode;
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  browserUrl: defaultBrowserUrl,
  collapsedChatDateGroupKeys: new Set(),
  expandedProjectIds: new Set(),
  rightSidebarOpen: initialWorkspaceMode === "work",
  rightSidebarWidth: initialRightSidebarWidth,
  setBrowserUrl: (browserUrl) =>
    set({ browserUrl: sanitizeBrowserUrl(browserUrl) }),
  setRightSidebarOpen: (rightSidebarOpen) => set({ rightSidebarOpen }),
  setRightSidebarWidth: (rightSidebarWidth) => {
    const nextRightSidebarWidth =
      clampWorkspaceRightSidebarWidth(rightSidebarWidth);
    writeRightSidebarWidth(nextRightSidebarWidth);
    set({ rightSidebarWidth: nextRightSidebarWidth });
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarOpenMobile: (sidebarOpenMobile) => set({ sidebarOpenMobile }),
  setWorkspaceMode: (workspaceMode) => {
    const nextWorkspaceMode = sanitizeWorkspaceMode(workspaceMode);
    writeWorkspaceMode(nextWorkspaceMode);
    set({ workspaceMode: nextWorkspaceMode });
  },
  sidebarOpen: true,
  sidebarOpenMobile: false,
  sidebarProjectIds: new Set(),
  syncSidebarProjects: (projectIds) =>
    set((current) => {
      const nextProjectIds = new Set(projectIds);
      const currentProjectIds = current.sidebarProjectIds;
      if (setsEqual(currentProjectIds, nextProjectIds)) {
        return current;
      }

      const nextExpandedProjectIds = new Set(current.expandedProjectIds);
      for (const projectId of currentProjectIds) {
        if (!nextProjectIds.has(projectId)) {
          nextExpandedProjectIds.delete(projectId);
        }
      }
      for (const projectId of nextProjectIds) {
        if (!currentProjectIds.has(projectId)) {
          nextExpandedProjectIds.add(projectId);
        }
      }

      return {
        expandedProjectIds: nextExpandedProjectIds,
        sidebarProjectIds: nextProjectIds,
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
  workspaceMode: initialWorkspaceMode,
}));

function readWorkspaceMode(): WorkspaceMode {
  try {
    return sanitizeWorkspaceMode(
      window.localStorage.getItem(workspaceModeStorageKey),
    );
  } catch {
    return "chat";
  }
}

function writeWorkspaceMode(workspaceMode: WorkspaceMode) {
  window.localStorage.setItem(workspaceModeStorageKey, workspaceMode);
}

function sanitizeWorkspaceMode(value: unknown): WorkspaceMode {
  return value === "work" ? "work" : "chat";
}

function sanitizeBrowserUrl(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : defaultBrowserUrl;
}

function readRightSidebarWidth() {
  try {
    const value = window.localStorage.getItem(rightSidebarWidthStorageKey);
    return value === null
      ? defaultRightSidebarWidth
      : clampWorkspaceRightSidebarWidth(Number(value));
  } catch {
    return defaultRightSidebarWidth;
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
    defaultRightSidebarWidth,
    minRightSidebarWidth,
    maxRightSidebarWidth,
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
