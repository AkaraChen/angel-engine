import type {
  WorkspaceToolSurfaceContext,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
  WorkspaceToolSurfaceState,
} from "@shared/workspace-tool-surface";
import type { WorkspaceFileReadResult } from "@shared/workspace-tools";

import { create } from "zustand";

export type WorkspaceWideFileState =
  | {
      status: "error";
      message: string;
    }
  | {
      status: "loading";
    }
  | {
      result: Extract<WorkspaceFileReadResult, { type: "unsupported" }>;
      status: "unsupported";
    }
  | {
      draftContent: string;
      savedContent: string;
      size: number;
      status: "text";
    };

export interface WorkspaceWideFilesState {
  activePath: string | null;
  fileStates: Record<string, WorkspaceWideFileState>;
  openFilePaths: string[];
}

export const emptyWorkspaceWideFilesState: WorkspaceWideFilesState = {
  activePath: null,
  fileStates: {},
  openFilePaths: [],
};

interface WorkspaceToolState {
  context: WorkspaceToolSurfaceContext;
  hydrated: boolean;
  host: WorkspaceToolSurfaceHost;
  snapshots: Record<string, WorkspaceToolSurfaceSnapshot>;
  wideFilesByRoot: Record<string, WorkspaceWideFilesState>;
  wideFilesEditorDirty: boolean;
  focusWorkspaceToolSurface: () => void;
  closeWideFile: (input: { path: string; root: string }) => void;
  openWideFile: (input: { path: string; root: string }) => void;
  requestWorkspaceToolHost: (host: WorkspaceToolSurfaceHost) => void;
  selectWideFile: (input: { path: string; root: string }) => void;
  setWideFileDraftContent: (input: {
    content: string;
    path: string;
    root: string;
  }) => void;
  setWideFileReadError: (input: {
    message: string;
    path: string;
    root: string;
  }) => void;
  setWideFileReadResult: (input: {
    result: WorkspaceFileReadResult;
    root: string;
  }) => void;
  setWideFileSavedContent: (input: {
    content: string;
    path: string;
    root: string;
    size: number;
  }) => void;
  setWideFilesEditorDirty: (dirty: boolean) => void;
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
    closeWideFile: (input) => {
      set((current) => {
        const rootState =
          current.wideFilesByRoot[input.root] ?? emptyWorkspaceWideFilesState;
        const closingIndex = rootState.openFilePaths.indexOf(input.path);
        const openFilePaths = rootState.openFilePaths.filter(
          (path) => path !== input.path,
        );
        const { [input.path]: _closedState, ...fileStates } =
          rootState.fileStates;
        const activePath =
          rootState.activePath === input.path
            ? (openFilePaths[
                Math.min(closingIndex, openFilePaths.length - 1)
              ] ?? null)
            : rootState.activePath;

        return {
          wideFilesByRoot: {
            ...current.wideFilesByRoot,
            [input.root]: {
              activePath,
              fileStates,
              openFilePaths,
            },
          },
        };
      });
    },
    context: {},
    focusWorkspaceToolSurface: () => {
      window.desktopWindow.focusWorkspaceToolSurface();
    },
    host: "sidebar",
    hydrated: false,
    openWideFile: (input) => {
      set((current) => {
        const rootState =
          current.wideFilesByRoot[input.root] ?? emptyWorkspaceWideFilesState;
        return {
          wideFilesByRoot: {
            ...current.wideFilesByRoot,
            [input.root]: {
              activePath: input.path,
              fileStates: {
                ...rootState.fileStates,
                [input.path]:
                  rootState.fileStates[input.path]?.status === "error"
                    ? { status: "loading" }
                    : (rootState.fileStates[input.path] ?? {
                        status: "loading",
                      }),
              },
              openFilePaths: rootState.openFilePaths.includes(input.path)
                ? rootState.openFilePaths
                : [...rootState.openFilePaths, input.path],
            },
          },
        };
      });
    },
    requestWorkspaceToolHost: (host) => {
      set({ host });
      window.desktopWindow.setWorkspaceToolSurfaceHost({ host });
    },
    selectWideFile: (input) => {
      set((current) => {
        const rootState = current.wideFilesByRoot[input.root];
        if (!rootState?.openFilePaths.includes(input.path)) {
          return {};
        }

        return {
          wideFilesByRoot: {
            ...current.wideFilesByRoot,
            [input.root]: {
              ...rootState,
              activePath: input.path,
            },
          },
        };
      });
    },
    setWideFileDraftContent: (input) => {
      set((current) => {
        const rootState = current.wideFilesByRoot[input.root];
        const fileState = rootState?.fileStates[input.path];
        if (fileState?.status !== "text") {
          return {};
        }

        return {
          wideFilesByRoot: {
            ...current.wideFilesByRoot,
            [input.root]: {
              ...rootState,
              fileStates: {
                ...rootState.fileStates,
                [input.path]: {
                  ...fileState,
                  draftContent: input.content,
                },
              },
            },
          },
        };
      });
    },
    setWideFileReadError: (input) => {
      set((current) => {
        const rootState = current.wideFilesByRoot[input.root];
        if (rootState?.fileStates[input.path]?.status !== "loading") {
          return {};
        }

        return {
          wideFilesByRoot: {
            ...current.wideFilesByRoot,
            [input.root]: {
              ...rootState,
              fileStates: {
                ...rootState.fileStates,
                [input.path]: {
                  message: input.message,
                  status: "error",
                },
              },
            },
          },
        };
      });
    },
    setWideFileReadResult: (input) => {
      set((current) => {
        const rootState = current.wideFilesByRoot[input.root];
        const path = input.result.path;
        if (rootState?.fileStates[path]?.status !== "loading") {
          return {};
        }

        return {
          wideFilesByRoot: {
            ...current.wideFilesByRoot,
            [input.root]: {
              ...rootState,
              fileStates: {
                ...rootState.fileStates,
                [path]: createWorkspaceWideFileState(input.result),
              },
            },
          },
        };
      });
    },
    setWideFileSavedContent: (input) => {
      set((current) => {
        const rootState = current.wideFilesByRoot[input.root];
        const fileState = rootState?.fileStates[input.path];
        if (fileState?.status !== "text") {
          return {};
        }

        return {
          wideFilesByRoot: {
            ...current.wideFilesByRoot,
            [input.root]: {
              ...rootState,
              fileStates: {
                ...rootState.fileStates,
                [input.path]: {
                  ...fileState,
                  savedContent: input.content,
                  size: input.size,
                },
              },
            },
          },
        };
      });
    },
    setWorkspaceToolContext: (context) => {
      set({ context });
      window.desktopWindow.setWorkspaceToolSurfaceContext(context);
    },
    setWideFilesEditorDirty: (dirty) => {
      set({ wideFilesEditorDirty: dirty });
    },
    snapshots: {},
    wideFilesByRoot: {},
    wideFilesEditorDirty: false,
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

function createWorkspaceWideFileState(
  result: WorkspaceFileReadResult,
): WorkspaceWideFileState {
  if (result.type === "unsupported") {
    return { result, status: "unsupported" };
  }

  return {
    draftContent: result.content,
    savedContent: result.content,
    size: result.size,
    status: "text",
  };
}

export function isWorkspaceWideFileStateDirty(
  state: WorkspaceWideFileState | undefined,
) {
  return state?.status === "text" && state.draftContent !== state.savedContent;
}
