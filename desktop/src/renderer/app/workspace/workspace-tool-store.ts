import type {
  WorkspaceToolSurfaceContext,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
  WorkspaceToolSurfaceState,
} from "@shared/workspace-tool-surface";

import { create } from "zustand";

interface WorkspaceToolState {
  context: WorkspaceToolSurfaceContext;
  hydrated: boolean;
  host: WorkspaceToolSurfaceHost;
  snapshots: Record<string, WorkspaceToolSurfaceSnapshot>;
  focusWorkspaceToolSurface: () => void;
  requestWorkspaceToolHost: (host: WorkspaceToolSurfaceHost) => void;
  setWorkspaceToolContext: (context: WorkspaceToolSurfaceContext) => void;
  syncWorkspaceToolState: (state: WorkspaceToolSurfaceState) => void;
  updateWorkspaceToolSnapshot: (
    chatId: string,
    updater: (
      snapshot: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
}

export const workspaceToolFilesTabId = "files";
export const workspaceToolGitTabId = "git";

export const useWorkspaceToolStore = create<WorkspaceToolState>()(
  (set, get) => ({
    context: {},
    focusWorkspaceToolSurface: () => {
      window.desktopWindow.focusWorkspaceToolSurface();
    },
    host: "sidebar",
    hydrated: false,
    requestWorkspaceToolHost: (host) => {
      set({ host });
      window.desktopWindow.setWorkspaceToolSurfaceHost({ host });
    },
    setWorkspaceToolContext: (context) => {
      set({ context });
      window.desktopWindow.setWorkspaceToolSurfaceContext(context);
    },
    snapshots: {},
    syncWorkspaceToolState: (state) => {
      const chatId = state.context.chatId ?? undefined;
      set((current) => ({
        context: state.context,
        host: state.host,
        hydrated: true,
        snapshots:
          chatId && state.snapshot
            ? {
                ...current.snapshots,
                [chatId]: state.snapshot,
              }
            : current.snapshots,
      }));
    },
    updateWorkspaceToolSnapshot: (chatId, updater) => {
      const currentSnapshot =
        get().snapshots[chatId] ?? createDefaultWorkspaceToolSnapshot();
      const snapshot = updater(currentSnapshot);

      set((current) => ({
        snapshots: {
          ...current.snapshots,
          [chatId]: snapshot,
        },
      }));
      window.desktopWindow.setWorkspaceToolSurfaceSnapshot({
        chatId,
        snapshot,
      });
    },
  }),
);

let workspaceToolSurfaceEventsInitialized = false;

export function ensureWorkspaceToolSurfaceEvents() {
  if (workspaceToolSurfaceEventsInitialized) {
    return;
  }
  workspaceToolSurfaceEventsInitialized = true;

  window.desktopWindow
    .getWorkspaceToolSurfaceState()
    .then((state) => {
      useWorkspaceToolStore.getState().syncWorkspaceToolState(state);
    })
    .catch((error) => {
      console.error("Failed to hydrate workspace tool surface state.", error);
      useWorkspaceToolStore.setState({ hydrated: true });
    });

  window.desktopWindow.onWorkspaceToolSurfaceChanged((state) => {
    useWorkspaceToolStore.getState().syncWorkspaceToolState(state);
  });
}

export function createDefaultWorkspaceToolSnapshot(): WorkspaceToolSurfaceSnapshot {
  return {
    activeTabId: workspaceToolFilesTabId,
    nextBrowserOrdinal: 1,
    nextTerminalOrdinal: 1,
    tabs: [],
  };
}

export function currentWorkspaceToolSnapshot(
  chatId: string | null | undefined,
  snapshots: Record<string, WorkspaceToolSurfaceSnapshot>,
) {
  if (!chatId) {
    return createDefaultWorkspaceToolSnapshot();
  }

  return snapshots[chatId] ?? createDefaultWorkspaceToolSnapshot();
}
