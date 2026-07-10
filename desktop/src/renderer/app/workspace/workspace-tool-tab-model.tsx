import type {
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  Globe as Browser,
  FileText,
  Folder,
  GitBranch,
  TerminalWindow as TerminalIcon,
} from "@phosphor-icons/react";
import { useCallback, useRef } from "react";

import {
  workspaceToolFilesTabId,
  workspaceToolGitTabId,
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

export function workspaceToolTabItems(
  dynamicTabs: WorkspaceToolSurfaceDynamicTab[],
): WorkspaceToolTabItem[] {
  return [
    {
      icon: Folder,
      id: workspaceToolFilesTabId,
      pinned: true,
      title: "Files",
    },
    {
      icon: GitBranch,
      id: workspaceToolGitTabId,
      pinned: true,
      title: "Git changes",
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
  if (
    snapshot.activeTabId === workspaceToolFilesTabId ||
    snapshot.activeTabId === workspaceToolGitTabId ||
    snapshot.tabs.some((tab) => tab.id === snapshot.activeTabId)
  ) {
    return snapshot.activeTabId;
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
