import type {
  WorkspaceToolSurfaceContext,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
  WorkspaceToolSurfaceState,
} from "@shared/workspace-tool-surface";
import type { WorkspaceFileReadResult } from "@shared/workspace-tools";

import is from "@sindresorhus/is";
import { create } from "zustand";

export type WorkspaceWindowFileState =
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

export interface WorkspaceWindowFilesState {
  activePath: string | null;
  fileStates: Record<string, WorkspaceWindowFileState>;
  openFilePaths: string[];
}

export const emptyWorkspaceWindowFilesState: WorkspaceWindowFilesState = {
  activePath: null,
  fileStates: {},
  openFilePaths: [],
};

interface WorkspaceToolState {
  context: WorkspaceToolSurfaceContext;
  hydrated: boolean;
  host: WorkspaceToolSurfaceHost;
  snapshots: Record<string, WorkspaceToolSurfaceSnapshot>;
  windowFilesByRoot: Record<string, WorkspaceWindowFilesState>;
  windowFilesEditorDirty: boolean;
  focusWorkspaceToolSurface: () => void;
  closeWindowFile: (input: { path: string; root: string }) => void;
  openWindowFile: (input: { path: string; root: string }) => void;
  requestWorkspaceToolHost: (host: WorkspaceToolSurfaceHost) => void;
  selectWindowFile: (input: { path: string; root: string }) => void;
  setWindowFileDraftContent: (input: {
    content: string;
    path: string;
    root: string;
  }) => void;
  setWindowFileReadError: (input: {
    message: string;
    path: string;
    root: string;
  }) => void;
  setWindowFileReadResult: (input: {
    result: WorkspaceFileReadResult;
    root: string;
  }) => void;
  setWindowFileSavedContent: (input: {
    content: string;
    path: string;
    root: string;
    size: number;
  }) => void;
  setWindowFilesEditorDirty: (dirty: boolean) => void;
  syncWorkspaceToolContext: (context: WorkspaceToolSurfaceContext) => void;
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
export const workspaceToolProcessesTabId = "processes";

export const useWorkspaceToolStore = create<WorkspaceToolState>()(
  (set, get) => ({
    closeWindowFile: (input) => {
      set((current) => {
        const rootState =
          current.windowFilesByRoot[input.root] ??
          emptyWorkspaceWindowFilesState;
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
          windowFilesByRoot: {
            ...current.windowFilesByRoot,
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
    openWindowFile: (input) => {
      set((current) => {
        const rootState =
          current.windowFilesByRoot[input.root] ??
          emptyWorkspaceWindowFilesState;
        return {
          windowFilesByRoot: {
            ...current.windowFilesByRoot,
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
    selectWindowFile: (input) => {
      set((current) => {
        const rootState = current.windowFilesByRoot[input.root];
        if (!rootState?.openFilePaths.includes(input.path)) {
          return {};
        }

        return {
          windowFilesByRoot: {
            ...current.windowFilesByRoot,
            [input.root]: {
              ...rootState,
              activePath: input.path,
            },
          },
        };
      });
    },
    setWindowFileDraftContent: (input) => {
      set((current) => {
        const rootState = current.windowFilesByRoot[input.root];
        const fileState = rootState?.fileStates[input.path];
        if (fileState?.status !== "text") {
          return {};
        }

        return {
          windowFilesByRoot: {
            ...current.windowFilesByRoot,
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
    setWindowFileReadError: (input) => {
      set((current) => {
        const rootState = current.windowFilesByRoot[input.root];
        if (rootState?.fileStates[input.path]?.status !== "loading") {
          return {};
        }

        return {
          windowFilesByRoot: {
            ...current.windowFilesByRoot,
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
    setWindowFileReadResult: (input) => {
      set((current) => {
        const rootState = current.windowFilesByRoot[input.root];
        const path = input.result.path;
        if (rootState?.fileStates[path]?.status !== "loading") {
          return {};
        }

        return {
          windowFilesByRoot: {
            ...current.windowFilesByRoot,
            [input.root]: {
              ...rootState,
              fileStates: {
                ...rootState.fileStates,
                [path]: createWorkspaceWindowFileState(input.result),
              },
            },
          },
        };
      });
    },
    setWindowFileSavedContent: (input) => {
      set((current) => {
        const rootState = current.windowFilesByRoot[input.root];
        const fileState = rootState?.fileStates[input.path];
        if (fileState?.status !== "text") {
          return {};
        }

        return {
          windowFilesByRoot: {
            ...current.windowFilesByRoot,
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
    syncWorkspaceToolContext: (context) => {
      set({ context });
      window.desktopWindow.setWorkspaceToolSurfaceContext(context);
    },
    setWindowFilesEditorDirty: (dirty) => {
      set({ windowFilesEditorDirty: dirty });
    },
    snapshots: {},
    windowFilesByRoot: {},
    windowFilesEditorDirty: false,
    syncWorkspaceToolState: (state) => {
      const chatId = state.context.chatId ?? undefined;
      set((current) => ({
        context: state.context,
        host: state.host,
        hydrated: true,
        snapshots:
          is.nonEmptyString(chatId) && !is.falsy(state.snapshot)
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

function createDefaultWorkspaceToolSnapshot(): WorkspaceToolSurfaceSnapshot {
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
  if (!is.nonEmptyString(chatId)) {
    return createDefaultWorkspaceToolSnapshot();
  }

  return snapshots[chatId] ?? createDefaultWorkspaceToolSnapshot();
}

function createWorkspaceWindowFileState(
  result: WorkspaceFileReadResult,
): WorkspaceWindowFileState {
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

export function isWorkspaceWindowFileStateDirty(
  state: WorkspaceWindowFileState | undefined,
) {
  return state?.status === "text" && state.draftContent !== state.savedContent;
}
