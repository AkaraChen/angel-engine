import type {
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceSnapshot,
  WorkspaceToolTabId,
} from "@shared/workspace-tool-surface";
import type { ReactNode } from "react";
import type { WorkspaceToolTabItem } from "@/app/workspace/workspace-tool-tab-model";
import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";

import { redirectChecksTabToPullRequest } from "@/app/workspace/workspace-tool-checks-focus";
import {
  currentWorkspaceToolSnapshot,
  useWorkspaceToolStore,
  workspaceToolChecksTabId,
  workspaceToolGitTabId,
  workspaceToolPullRequestTabId,
} from "@/app/workspace/workspace-tool-store";
import {
  visibleActiveWorkspaceToolTabId,
  workspaceToolTabItems,
} from "@/app/workspace/workspace-tool-tab-model";

type WorkspaceToolSnapshotUpdater = (
  current: WorkspaceToolSurfaceSnapshot,
) => WorkspaceToolSurfaceSnapshot;

export interface WorkspaceToolSurfaceModel {
  active: boolean;
  activeDynamicTab?: WorkspaceToolSurfaceDynamicTab;
  activeTabId: string;
  chatId: string | null;
  api: ApiClient;
  contextKey: string | null;
  focusChecksSection: boolean;
  closeDynamicTab: (tab: WorkspaceToolSurfaceDynamicTab) => void;
  openExternal: (url: string) => void;
  projectId: string | null;
  root: string | null;
  selectTab: (tabId: WorkspaceToolTabId) => Promise<boolean>;
  tabItems: WorkspaceToolTabItem[];
  updateSnapshot: (updater: WorkspaceToolSnapshotUpdater) => void;
}

export function useWorkspaceToolSurfaceModel({
  active,
  api,
  contextKey: propContextKey,
  root: propRoot,
}: {
  active: boolean;
  api: ApiClient;
  contextKey?: string | null;
  root?: string | null;
}): WorkspaceToolSurfaceModel {
  const context = useWorkspaceToolStore((state) => state.context);
  const snapshots = useWorkspaceToolStore((state) => state.snapshots);
  const storeUpdateSnapshot = useWorkspaceToolStore(
    (state) => state.updateWorkspaceToolSnapshot,
  );
  const contextKey = propContextKey ?? context.contextKey ?? null;
  const chatId = context.chatId ?? null;
  const projectId = context.projectId ?? null;
  const root = propRoot ?? context.root ?? null;
  const snapshot = currentWorkspaceToolSnapshot(contextKey, snapshots);
  // Immediately redirect a legacy/persisted `"checks"` tab to `"pr"` while
  // parking the scroll/highlight intent on `focusSection` until Checks mounts.
  useEffect(() => {
    if (snapshot.activeTabId !== workspaceToolChecksTabId) {
      return;
    }
    if (!is.nonEmptyString(contextKey)) {
      return;
    }
    storeUpdateSnapshot(contextKey, (current) =>
      redirectChecksTabToPullRequest(current),
    );
  }, [contextKey, snapshot.activeTabId, storeUpdateSnapshot]);
  const focusChecksSection =
    snapshot.focusSection === "checks" ||
    snapshot.activeTabId === workspaceToolChecksTabId;
  const activeTabId = visibleActiveWorkspaceToolTabId(snapshot);
  const activeDynamicTab = snapshot.tabs.find((tab) => tab.id === activeTabId);
  const updateSnapshot = useCallback(
    (updater: WorkspaceToolSnapshotUpdater) => {
      if (!is.nonEmptyString(contextKey)) {
        return;
      }

      storeUpdateSnapshot(contextKey, updater);
    },
    [contextKey, storeUpdateSnapshot],
  );
  const selectTab = useCallback(
    async (tabId: WorkspaceToolTabId) => {
      const resolvedTabId =
        tabId === workspaceToolChecksTabId
          ? workspaceToolPullRequestTabId
          : tabId;
      updateSnapshot((current) => ({
        ...current,
        activeTabId: resolvedTabId,
        focusSection:
          tabId === workspaceToolChecksTabId
            ? "checks"
            : resolvedTabId === workspaceToolPullRequestTabId
              ? (current.focusSection ?? null)
              : null,
      }));
      return true;
    },
    [updateSnapshot],
  );
  const openExternal = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);
  const closeDynamicTab = useCallback(
    (tab: WorkspaceToolSurfaceDynamicTab) => {
      updateSnapshot((current) => {
        const tabIndex = current.tabs.findIndex(
          (candidate) => candidate.id === tab.id,
        );
        const tabs = current.tabs.filter(
          (candidate) => candidate.id !== tab.id,
        );
        const nextActiveTab =
          current.activeTabId === tab.id
            ? (tabs[Math.max(0, Math.min(tabIndex, tabs.length - 1))]?.id ??
              workspaceToolGitTabId)
            : current.activeTabId;

        return {
          ...current,
          activeTabId: nextActiveTab,
          tabs,
        };
      });
    },
    [updateSnapshot],
  );
  const { t } = useTranslation();
  const tabItems = useMemo(
    () =>
      workspaceToolTabItems(snapshot.tabs, {
        gitChanges: t("workspace.tools.tabs.gitChanges"),
        pullRequest: t("workspace.tools.tabs.pullRequest"),
      }),
    [snapshot.tabs, t],
  );

  return useMemo(
    () => ({
      active,
      activeDynamicTab,
      activeTabId,
      api,
      chatId,
      contextKey,
      focusChecksSection,
      closeDynamicTab,
      openExternal,
      projectId,
      root,
      selectTab,
      tabItems,
      updateSnapshot,
    }),
    [
      active,
      activeDynamicTab,
      activeTabId,
      api,
      chatId,
      contextKey,
      focusChecksSection,
      closeDynamicTab,
      openExternal,
      projectId,
      root,
      selectTab,
      tabItems,
      updateSnapshot,
    ],
  );
}

const WorkspaceToolSurfaceContext =
  createContext<WorkspaceToolSurfaceModel | null>(null);

export function WorkspaceToolSurfaceProvider({
  children,
  model,
}: {
  children: ReactNode;
  model: WorkspaceToolSurfaceModel;
}) {
  return (
    <WorkspaceToolSurfaceContext.Provider value={model}>
      {children}
    </WorkspaceToolSurfaceContext.Provider>
  );
}

export function useWorkspaceToolSurface() {
  const model = useContext(WorkspaceToolSurfaceContext);
  if (model === null) {
    throw new Error(
      "useWorkspaceToolSurface must be used within a WorkspaceToolSurfaceProvider.",
    );
  }
  return model;
}
