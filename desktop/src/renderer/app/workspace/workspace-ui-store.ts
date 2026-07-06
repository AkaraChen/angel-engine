import { create } from "zustand";

export type WorkspaceMode = "chat" | "work";

export type WorkspaceLastOpenedTarget =
  | { chatId: string; type: "chat" }
  | { projectId?: string; type: "draft" };

type WorkspaceLastOpenedTargets = Partial<
  Record<WorkspaceMode, WorkspaceLastOpenedTarget>
>;

const workspaceModeStorageKey = "angel-engine.workspace-mode";
const workspaceLastOpenedTargetsStorageKey =
  "angel-engine.workspace-last-opened-chat-ids";
const rightSidebarWidthStorageKey = "angel-engine.right-sidebar-width";
const defaultBrowserUrl = "about:blank";
export const defaultWorkspaceRightSidebarWidth = 288;
export const minWorkspaceRightSidebarWidth = 240;
export const maxWorkspaceRightSidebarWidth = 520;
const initialWorkspaceMode = readWorkspaceMode();
const initialLastOpenedTargets = readLastOpenedTargets();
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
  expandedProjectIds: Set<string>;
  lastOpenedTargets: WorkspaceLastOpenedTargets;
  rememberLastOpenedTarget: (
    workspaceMode: WorkspaceMode,
    target: WorkspaceLastOpenedTarget,
  ) => void;
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
  sidebarProjectIdsWithChats: Set<string>;
  syncSidebarProjects: (
    projectIds: string[],
    projectIdsWithChats: string[],
  ) => void;
  toggleRightSidebar: () => void;
  toggleSidebarChatDateGroup: (groupKey: SidebarChatDateGroupKey) => void;
  toggleSidebarProject: (projectId: string) => void;
  workspaceMode: WorkspaceMode;
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  browserUrl: defaultBrowserUrl,
  collapsedChatDateGroupKeys: new Set(),
  expandedProjectIds: new Set(),
  lastOpenedTargets: initialLastOpenedTargets,
  rememberLastOpenedTarget: (workspaceMode, target) =>
    set((current) => {
      const nextWorkspaceMode = sanitizeWorkspaceMode(workspaceMode);
      const nextTarget = sanitizeLastOpenedTarget(target);
      if (nextTarget === undefined) return current;
      if (
        lastOpenedTargetsEqual(
          current.lastOpenedTargets[nextWorkspaceMode],
          nextTarget,
        )
      ) {
        return current;
      }

      const lastOpenedTargets = {
        ...current.lastOpenedTargets,
        [nextWorkspaceMode]: nextTarget,
      };
      writeLastOpenedTargets(lastOpenedTargets);

      return { lastOpenedTargets };
    }),
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

function readLastOpenedTargets(): WorkspaceLastOpenedTargets {
  try {
    return sanitizeLastOpenedTargets(
      JSON.parse(
        window.localStorage.getItem(workspaceLastOpenedTargetsStorageKey) ??
          "{}",
      ),
    );
  } catch {
    return {};
  }
}

function writeLastOpenedTargets(lastOpenedTargets: WorkspaceLastOpenedTargets) {
  window.localStorage.setItem(
    workspaceLastOpenedTargetsStorageKey,
    JSON.stringify(sanitizeLastOpenedTargets(lastOpenedTargets)),
  );
}

function sanitizeLastOpenedTargets(value: unknown): WorkspaceLastOpenedTargets {
  if (value === null || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;

  return {
    chat: sanitizeLastOpenedTarget(record.chat),
    work: sanitizeLastOpenedTarget(record.work),
  };
}

function sanitizeLastOpenedTarget(
  value: unknown,
): WorkspaceLastOpenedTarget | undefined {
  const legacyChatId = sanitizeOptionalString(value);
  if (legacyChatId !== undefined) {
    return { chatId: legacyChatId, type: "chat" };
  }
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;

  if (record.type === "chat") {
    const chatId = sanitizeOptionalString(record.chatId);
    return chatId === undefined ? undefined : { chatId, type: "chat" };
  }
  if (record.type === "draft") {
    const projectId = sanitizeOptionalString(record.projectId);
    return projectId === undefined
      ? { type: "draft" }
      : { projectId, type: "draft" };
  }
  return undefined;
}

function lastOpenedTargetsEqual(
  left: WorkspaceLastOpenedTarget | undefined,
  right: WorkspaceLastOpenedTarget,
) {
  if (left === undefined) return false;
  if (left.type === "chat" || right.type === "chat") {
    return left.type === "chat" && right.type === "chat"
      ? left.chatId === right.chatId
      : false;
  }
  return left.projectId === right.projectId;
}

function sanitizeWorkspaceMode(value: unknown): WorkspaceMode {
  return value === "work" ? "work" : "chat";
}

function sanitizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
