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
  collapsedChatDateGroupKeys: Set<SidebarChatDateGroupKey>;
  rightSidebarOpen: boolean;
  rightSidebarWidth: number;
  setRightSidebarOpen: (rightSidebarOpen: boolean) => void;
  setRightSidebarWidth: (rightSidebarWidth: number) => void;
  setSidebarOpen: (sidebarOpen: boolean) => void;
  setSidebarOpenMobile: (sidebarOpenMobile: boolean) => void;
  sidebarOpen: boolean;
  sidebarOpenMobile: boolean;
  toggleRightSidebar: () => void;
  toggleSidebarChatDateGroup: (groupKey: SidebarChatDateGroupKey) => void;
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  collapsedChatDateGroupKeys: new Set(),
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
