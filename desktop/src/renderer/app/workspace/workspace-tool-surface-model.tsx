import type {
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
  WorkspaceToolTabId,
} from "@shared/workspace-tool-surface";
import type { ReactNode } from "react";
import type { WorkspaceToolTabItem } from "@/app/workspace/workspace-tool-tab-model";
import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { browserTitleFromUrl } from "@/app/workspace/workspace-browser-url";
import {
  currentWorkspaceToolSnapshot,
  useWorkspaceToolStore,
  workspaceToolFilesTabId,
} from "@/app/workspace/workspace-tool-store";
import {
  visibleActiveWorkspaceToolTabId,
  workspaceToolTabItems,
} from "@/app/workspace/workspace-tool-tab-model";
import {
  confirmWorkspaceWindowFilesExit,
  useWorkspaceWindowFileOpener,
} from "@/app/workspace/workspace-window-file-state";
import { terminalClient } from "@/platform/terminal-client";

const defaultWorkspaceToolBrowserUrl = "about:blank";

type WorkspaceToolSnapshotUpdater = (
  current: WorkspaceToolSurfaceSnapshot,
) => WorkspaceToolSurfaceSnapshot;

export interface WorkspaceToolSurfaceModel {
  active: boolean;
  activeDynamicTab?: WorkspaceToolSurfaceDynamicTab;
  activeTabId: string;
  addBrowserTab: () => void;
  addTerminalTab: () => void;
  api: ApiClient;
  chatId: string | null;
  closeDynamicTab: (tab: WorkspaceToolSurfaceDynamicTab) => void;
  host: WorkspaceToolSurfaceHost;
  openBrowserTab: (url: string) => void;
  openFileTab: (path: string) => void;
  requestSurfaceHost: (host: WorkspaceToolSurfaceHost) => Promise<void>;
  root: string | null;
  selectTab: (tabId: WorkspaceToolTabId) => Promise<boolean>;
  tabItems: WorkspaceToolTabItem[];
  updateSnapshot: (updater: WorkspaceToolSnapshotUpdater) => void;
}

export function useWorkspaceToolSurfaceModel({
  active,
  api,
  chatId: propChatId,
  host,
  root: propRoot,
}: {
  active: boolean;
  api: ApiClient;
  chatId?: string | null;
  host: WorkspaceToolSurfaceHost;
  root?: string | null;
}): WorkspaceToolSurfaceModel {
  const queryClient = useQueryClient();
  const context = useWorkspaceToolStore((state) => state.context);
  const snapshots = useWorkspaceToolStore((state) => state.snapshots);
  const storeUpdateSnapshot = useWorkspaceToolStore(
    (state) => state.updateWorkspaceToolSnapshot,
  );
  const requestHost = useWorkspaceToolStore(
    (state) => state.requestWorkspaceToolHost,
  );
  const chatId = propChatId ?? context.chatId ?? null;
  const root = propRoot ?? context.root ?? null;
  const snapshot = currentWorkspaceToolSnapshot(chatId, snapshots);
  const activeTabId = visibleActiveWorkspaceToolTabId(snapshot);
  const activeDynamicTab = snapshot.tabs.find((tab) => tab.id === activeTabId);
  const openWorkspaceWindowFile = useWorkspaceWindowFileOpener(api);
  const confirmWindowFilesEditorExit = useCallback(async () => {
    if (host === "sidebar") {
      return true;
    }
    return confirmWorkspaceWindowFilesExit({ api, queryClient, root });
  }, [api, host, queryClient, root]);
  const requestSurfaceHost = useCallback(
    async (nextHost: WorkspaceToolSurfaceHost) => {
      if (nextHost !== host && !(await confirmWindowFilesEditorExit())) {
        return;
      }
      requestHost(nextHost);
    },
    [confirmWindowFilesEditorExit, host, requestHost],
  );
  const updateSnapshot = useCallback(
    (updater: WorkspaceToolSnapshotUpdater) => {
      if (!is.nonEmptyString(chatId)) {
        return;
      }

      storeUpdateSnapshot(chatId, updater);
    },
    [chatId, storeUpdateSnapshot],
  );
  const windowFileOpenRequest = snapshot.windowFileOpenRequest;
  const handledWindowFileOpenRequestIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      host === "sidebar" ||
      windowFileOpenRequest === undefined ||
      handledWindowFileOpenRequestIdRef.current === windowFileOpenRequest.id
    ) {
      return;
    }

    handledWindowFileOpenRequestIdRef.current = windowFileOpenRequest.id;
    openWorkspaceWindowFile({
      path: windowFileOpenRequest.path,
      root: windowFileOpenRequest.root,
    });
    updateSnapshot((current) =>
      current.windowFileOpenRequest?.id === windowFileOpenRequest.id
        ? { ...current, windowFileOpenRequest: undefined }
        : current,
    );
  }, [host, openWorkspaceWindowFile, updateSnapshot, windowFileOpenRequest]);
  const selectTab = useCallback(
    async (tabId: WorkspaceToolTabId) => {
      if (tabId !== activeTabId && !(await confirmWindowFilesEditorExit())) {
        return false;
      }
      updateSnapshot((current) => ({ ...current, activeTabId: tabId }));
      return true;
    },
    [activeTabId, confirmWindowFilesEditorExit, updateSnapshot],
  );
  const openFileTab = useCallback(
    (path: string) => {
      if (!is.nonEmptyString(root)) {
        return;
      }

      openWorkspaceWindowFile({ path, root });
      updateSnapshot((current) => ({
        ...current,
        activeTabId: workspaceToolFilesTabId,
        windowFileOpenRequest:
          host === "sidebar"
            ? {
                id: crypto.randomUUID(),
                path,
                root,
              }
            : current.windowFileOpenRequest,
      }));
      if (host === "sidebar") {
        void requestSurfaceHost("window");
      }
    },
    [host, openWorkspaceWindowFile, requestSurfaceHost, root, updateSnapshot],
  );
  const addTerminalTab = useCallback(() => {
    if (!is.nonEmptyString(root)) {
      return;
    }

    updateSnapshot((current) => {
      const tab = {
        id: crypto.randomUUID(),
        kind: "terminal" as const,
        root,
        sessionId: crypto.randomUUID(),
        title: `Terminal ${current.nextTerminalOrdinal}`,
      };

      return {
        ...current,
        activeTabId: tab.id,
        nextTerminalOrdinal: current.nextTerminalOrdinal + 1,
        tabs: [...current.tabs, tab],
      };
    });
  }, [root, updateSnapshot]);
  const openBrowserTab = useCallback(
    (url: string) => {
      updateSnapshot((current) => {
        const tab = {
          browserViewId: crypto.randomUUID(),
          draftUrl: url,
          id: crypto.randomUUID(),
          kind: "browser" as const,
          title:
            url === defaultWorkspaceToolBrowserUrl
              ? `Browser ${current.nextBrowserOrdinal}`
              : browserTitleFromUrl(url),
          url,
        };

        return {
          ...current,
          activeTabId: tab.id,
          nextBrowserOrdinal: current.nextBrowserOrdinal + 1,
          tabs: [...current.tabs, tab],
        };
      });
    },
    [updateSnapshot],
  );
  const addBrowserTab = useCallback(() => {
    openBrowserTab(defaultWorkspaceToolBrowserUrl);
  }, [openBrowserTab]);
  const closeDynamicTab = useCallback(
    (tab: WorkspaceToolSurfaceDynamicTab) => {
      if (tab.kind === "terminal") {
        terminalClient.kill({ sessionId: tab.sessionId });
      }
      if (tab.kind === "browser") {
        void window.workspaceBrowser
          .destroy({
            browserViewId: tab.browserViewId,
          })
          .catch((error: unknown) => {
            console.error("Failed to destroy workspace browser view.", {
              browserViewId: tab.browserViewId,
              error,
              tabId: tab.id,
            });
          });
      }

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
              workspaceToolFilesTabId)
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
  const tabItems = useMemo(
    () => workspaceToolTabItems(snapshot.tabs),
    [snapshot.tabs],
  );

  return useMemo(
    () => ({
      active,
      activeDynamicTab,
      activeTabId,
      addBrowserTab,
      addTerminalTab,
      api,
      chatId,
      closeDynamicTab,
      host,
      openBrowserTab,
      openFileTab,
      requestSurfaceHost,
      root,
      selectTab,
      tabItems,
      updateSnapshot,
    }),
    [
      active,
      activeDynamicTab,
      activeTabId,
      addBrowserTab,
      addTerminalTab,
      api,
      chatId,
      closeDynamicTab,
      host,
      openBrowserTab,
      openFileTab,
      requestSurfaceHost,
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
