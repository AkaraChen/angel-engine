import type {
  WorkspaceToolSurfaceContext,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";

import is from "@sindresorhus/is";
import { create } from "zustand";

interface WorkspaceToolState {
  context: WorkspaceToolSurfaceContext;
  snapshots: Record<string, WorkspaceToolSurfaceSnapshot>;
  syncWorkspaceToolContext: (context: WorkspaceToolSurfaceContext) => void;
  updateWorkspaceToolSnapshot: (
    contextKey: string,
    updater: (
      snapshot: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
}

export const useWorkspaceToolStore = create<WorkspaceToolState>()(
  (set, get) => ({
    context: {},
    snapshots: {},
    syncWorkspaceToolContext: (context) => set({ context }),
    updateWorkspaceToolSnapshot: (contextKey, updater) => {
      const currentSnapshot =
        get().snapshots[contextKey] ?? createDefaultWorkspaceToolSnapshot();
      set((current) => ({
        snapshots: {
          ...current.snapshots,
          [contextKey]: updater(currentSnapshot),
        },
      }));
    },
  }),
);

function createDefaultWorkspaceToolSnapshot(): WorkspaceToolSurfaceSnapshot {
  return {
    activeTabId: "dynamic",
    tabs: [],
  };
}

function sanitizeWorkspaceToolSnapshot(
  snapshot: WorkspaceToolSurfaceSnapshot,
): WorkspaceToolSurfaceSnapshot {
  const tabs = snapshot.tabs.filter(
    (tab) =>
      (tab.kind as string) !== "browser" && (tab.kind as string) !== "terminal",
  );
  const activeTabId = tabs.some((tab) => tab.id === snapshot.activeTabId)
    ? snapshot.activeTabId
    : (tabs[0]?.id ?? "dynamic");

  return { ...snapshot, activeTabId, tabs };
}

export function currentWorkspaceToolSnapshot(
  contextKey: string | null | undefined,
  snapshots: Record<string, WorkspaceToolSurfaceSnapshot>,
) {
  if (!is.nonEmptyString(contextKey)) {
    return createDefaultWorkspaceToolSnapshot();
  }

  return sanitizeWorkspaceToolSnapshot(
    snapshots[contextKey] ?? createDefaultWorkspaceToolSnapshot(),
  );
}
