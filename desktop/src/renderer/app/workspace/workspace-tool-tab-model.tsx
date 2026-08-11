import type {
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  Globe as Browser,
  Cpu,
  FileText,
  Folder,
  GitBranch,
  GitPullRequest,
  TerminalWindow as TerminalIcon,
} from "@phosphor-icons/react";
import { useCallback, useRef } from "react";

import {
  workspaceToolChecksTabId,
  workspaceToolFilesTabId,
  workspaceToolGitTabId,
  workspaceToolPullRequestTabId,
  workspaceToolProcessesTabId,
} from "@/app/workspace/workspace-tool-store";

export type WorkspaceToolTabSelectHandler = (
  tabId: string,
) => boolean | Promise<boolean> | void;

export function useWorkspaceToolTabKeyboard<T extends { id: string }>({
  onCloseTab,
  onSelectTab,
  orientation,
  tabs,
}: {
  onCloseTab?: (tab: T) => void;
  onSelectTab: WorkspaceToolTabSelectHandler;
  orientation: "horizontal" | "vertical";
  tabs: readonly T[];
}) {
  const tabButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const setTabButtonRef = useCallback(
    (tabId: string, button: HTMLButtonElement | null) => {
      if (button) {
        tabButtonsRef.current.set(tabId, button);
      } else {
        tabButtonsRef.current.delete(tabId);
      }
    },
    [],
  );
  const selectAndFocusTab = useCallback(
    (index: number) => {
      const tab = tabs.at(index);
      if (tab === undefined) {
        return;
      }

      void Promise.resolve(onSelectTab(tab.id)).then((selected) => {
        if (selected === false) {
          return;
        }
        window.requestAnimationFrame(() => {
          tabButtonsRef.current.get(tab.id)?.focus();
        });
      });
    },
    [onSelectTab, tabs],
  );
  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, tabId: string) => {
      const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (currentIndex < 0) {
        return;
      }

      if (
        onCloseTab !== undefined &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        const tab = tabs.at(currentIndex);
        if (tab === undefined) {
          return;
        }
        const tablist = event.currentTarget.closest('[role="tablist"]');
        event.preventDefault();
        onCloseTab(tab);
        window.requestAnimationFrame(() => {
          tablist
            ?.querySelector<HTMLButtonElement>('[role="tab"][tabindex="0"]')
            ?.focus();
        });
        return;
      }

      let nextIndex: number | null = null;
      if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      } else if (
        (orientation === "horizontal" && event.key === "ArrowRight") ||
        (orientation === "vertical" && event.key === "ArrowDown")
      ) {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (
        (orientation === "horizontal" && event.key === "ArrowLeft") ||
        (orientation === "vertical" && event.key === "ArrowUp")
      ) {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      }

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      selectAndFocusTab(nextIndex);
    },
    [onCloseTab, orientation, selectAndFocusTab, tabs],
  );

  return { handleTabKeyDown, setTabButtonRef, tabButtonsRef };
}

export interface WorkspaceToolTabItem {
  dynamicTab?: WorkspaceToolSurfaceDynamicTab;
  icon: typeof Folder;
  id: string;
  pinned: boolean;
  title: string;
}

export interface WorkspaceToolPinnedTabLabels {
  files: string;
  gitChanges: string;
  pullRequest: string;
  processes: string;
}

/**
 * Legacy `"checks"` tab ids redirect to the merged Pull Request tab so
 * command-palette paths and persisted snapshots never open a blank panel.
 */
export function resolveWorkspaceToolTabId(tabId: string) {
  if (tabId === workspaceToolChecksTabId) {
    return workspaceToolPullRequestTabId;
  }
  return tabId;
}

export function workspaceToolTabItems(
  dynamicTabs: WorkspaceToolSurfaceDynamicTab[],
  labels: WorkspaceToolPinnedTabLabels,
): WorkspaceToolTabItem[] {
  return [
    {
      icon: Folder,
      id: workspaceToolFilesTabId,
      pinned: true,
      title: labels.files,
    },
    {
      icon: GitBranch,
      id: workspaceToolGitTabId,
      pinned: true,
      title: labels.gitChanges,
    },
    {
      icon: GitPullRequest,
      id: workspaceToolPullRequestTabId,
      pinned: true,
      title: labels.pullRequest,
    },
    {
      icon: Cpu,
      id: workspaceToolProcessesTabId,
      pinned: true,
      title: labels.processes,
    },
    ...dynamicTabs.map((tab) => ({
      dynamicTab: tab,
      icon: workspaceToolTabIcon(tab),
      id: tab.id,
      pinned: false,
      title: tab.title,
    })),
  ];
}

export function visibleActiveWorkspaceToolTabId(
  snapshot: WorkspaceToolSurfaceSnapshot,
) {
  const activeTabId = resolveWorkspaceToolTabId(snapshot.activeTabId);
  if (
    activeTabId === workspaceToolFilesTabId ||
    activeTabId === workspaceToolGitTabId ||
    activeTabId === workspaceToolPullRequestTabId ||
    activeTabId === workspaceToolProcessesTabId ||
    snapshot.tabs.some((tab) => tab.id === activeTabId)
  ) {
    return activeTabId;
  }

  return workspaceToolFilesTabId;
}

export function workspaceToolTabIcon(tab: WorkspaceToolSurfaceDynamicTab) {
  switch (tab.kind) {
    case "browser":
      return Browser;
    case "file-preview":
      return FileText;
    case "git-diff":
      return GitBranch;
    case "terminal":
      return TerminalIcon;
  }
}
