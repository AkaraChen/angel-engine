import type {
  WorkspaceToolPinnedTabId,
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  WorkspaceToolContent,
  WorkspaceToolWindowContent,
} from "@/app/workspace/workspace-tool-content";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { WorkspaceToolSurfaceHeader } from "@/app/workspace/workspace-tool-surface-header";
import {
  currentWorkspaceToolSnapshot,
  ensureWorkspaceToolSurfaceEvents,
  useWorkspaceToolStore,
  workspaceToolFilesTabId,
} from "@/app/workspace/workspace-tool-store";
import {
  visibleActiveWorkspaceToolTabId,
  workspaceToolTabItems,
} from "@/app/workspace/workspace-tool-tab-model";
import {
  WorkspaceToolTabStrip,
  WorkspaceToolVerticalTabSidebar,
} from "@/app/workspace/workspace-tool-tab-navigation";
import {
  confirmWorkspaceWindowFilesExit,
  useWorkspaceWindowFileOpener,
} from "@/app/workspace/workspace-window-file-state";
import { browserTitleFromUrl } from "./workspace-browser-url";

const defaultWorkspaceToolBrowserUrl = "about:blank";

interface WorkspaceToolSurfaceProps {
  active?: boolean;
  api: ApiClient;
  chatId?: string | null;
  host: WorkspaceToolSurfaceHost;
  root?: string | null;
  trafficLightInset?: boolean;
}

export function WorkspaceToolSurface({
  active = true,
  api,
  chatId: propChatId,
  host,
  root: propRoot,
  trafficLightInset = false,
}: WorkspaceToolSurfaceProps) {
  ensureWorkspaceToolSurfaceEvents();
  const queryClient = useQueryClient();
  const context = useWorkspaceToolStore((state) => state.context);
  const snapshots = useWorkspaceToolStore((state) => state.snapshots);
  const updateSnapshot = useWorkspaceToolStore(
    (state) => state.updateWorkspaceToolSnapshot,
  );
  const requestHost = useWorkspaceToolStore(
    (state) => state.requestWorkspaceToolHost,
  );
  const storeHost = useWorkspaceToolStore((state) => state.host);
  const surfaceRef = useRef<HTMLElement>(null);
  const previousStoreHostRef = useRef<WorkspaceToolSurfaceHost | null>(null);
  useEffect(() => {
    const previousHost = previousStoreHostRef.current;
    previousStoreHostRef.current = storeHost;
    if (
      host !== "sidebar" ||
      previousHost !== "window" ||
      storeHost !== "sidebar"
    ) {
      return;
    }
    window.requestAnimationFrame(() => {
      surfaceRef.current?.focus();
    });
  }, [host, storeHost]);
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
  const setSnapshot = useCallback(
    (
      updater: (
        current: WorkspaceToolSurfaceSnapshot,
      ) => WorkspaceToolSurfaceSnapshot,
    ) => {
      if (!is.nonEmptyString(chatId)) {
        return;
      }

      updateSnapshot(chatId, updater);
    },
    [chatId, updateSnapshot],
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
    setSnapshot((current) =>
      current.windowFileOpenRequest?.id === windowFileOpenRequest.id
        ? { ...current, windowFileOpenRequest: undefined }
        : current,
    );
  }, [host, openWorkspaceWindowFile, setSnapshot, windowFileOpenRequest]);
  const selectTab = useCallback(
    async (tabId: WorkspaceToolPinnedTabId | string) => {
      if (tabId !== activeTabId && !(await confirmWindowFilesEditorExit())) {
        return false;
      }
      setSnapshot((current) => ({ ...current, activeTabId: tabId }));
      return true;
    },
    [activeTabId, confirmWindowFilesEditorExit, setSnapshot],
  );
  const openFileTab = useCallback(
    (path: string) => {
      if (!is.nonEmptyString(root)) {
        return;
      }

      openWorkspaceWindowFile({ path, root });
      setSnapshot((current) => ({
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
    [host, openWorkspaceWindowFile, requestSurfaceHost, root, setSnapshot],
  );
  const addTerminalTab = useCallback(() => {
    if (!is.nonEmptyString(root)) {
      return;
    }

    setSnapshot((current) => {
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
  }, [root, setSnapshot]);
  const openBrowserTab = useCallback(
    (url: string) => {
      setSnapshot((current) => {
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
    [setSnapshot],
  );
  const addBrowserTab = useCallback(() => {
    openBrowserTab(defaultWorkspaceToolBrowserUrl);
  }, [openBrowserTab]);
  const closeDynamicTab = useCallback(
    (tab: WorkspaceToolSurfaceDynamicTab) => {
      if (tab.kind === "terminal") {
        window.terminal.kill({ sessionId: tab.sessionId });
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

      setSnapshot((current) => {
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
    [setSnapshot],
  );
  const tabItems = useMemo(
    () => workspaceToolTabItems(snapshot.tabs),
    [snapshot.tabs],
  );
  return (
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden
        bg-background text-foreground select-none
      "
      ref={surfaceRef}
      tabIndex={-1}
    >
      {host !== "sidebar" ? (
        <WorkspaceToolSurfaceHeader
          host={host}
          root={root}
          trafficLightInset={trafficLightInset}
          onRequestHost={(nextHost) => {
            void requestSurfaceHost(nextHost);
          }}
        />
      ) : null}
      {!is.nonEmptyString(chatId) || !is.nonEmptyString(root) ? (
        <WorkspaceToolEmpty title="No workspace for this chat" />
      ) : host === "sidebar" ? (
        <>
          <WorkspaceToolTabStrip
            activeTabId={activeTabId}
            tabs={tabItems}
            onAddBrowserTab={addBrowserTab}
            onAddTerminalTab={addTerminalTab}
            onCloseDynamicTab={closeDynamicTab}
            onSelectTab={selectTab}
          />
          <div
            aria-labelledby={`workspace-tool-tab-${activeTabId}`}
            className="min-h-0 flex-1 overflow-hidden"
            id="workspace-tool-panel"
            role="tabpanel"
          >
            <WorkspaceToolContent
              activeDynamicTab={activeDynamicTab}
              activeTabId={activeTabId}
              api={api}
              surfaceActive={active}
              root={root}
              onBrowserTabChange={setSnapshot}
              onOpenBrowser={openBrowserTab}
              onOpenFile={openFileTab}
            />
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkspaceToolVerticalTabSidebar
            activeTabId={activeTabId}
            tabs={tabItems}
            onAddBrowserTab={addBrowserTab}
            onAddTerminalTab={addTerminalTab}
            onCloseDynamicTab={closeDynamicTab}
            onSelectTab={selectTab}
          />
          <div
            aria-labelledby={`workspace-tool-tab-${activeTabId}`}
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            id="workspace-tool-panel"
            role="tabpanel"
          >
            <WorkspaceToolWindowContent
              activeDynamicTab={activeDynamicTab}
              activeTabId={activeTabId}
              api={api}
              root={root}
              surfaceActive={active}
              onBrowserTabChange={setSnapshot}
              onOpenBrowser={openBrowserTab}
              onOpenFile={openFileTab}
            />
          </div>
        </div>
      )}
    </section>
  );
}
