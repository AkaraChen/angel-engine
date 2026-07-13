import type {
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type { ApiClient } from "@/platform/api-client";

import { WorkspaceBrowserTabContent } from "@/app/workspace/workspace-browser-tab";
import {
  WorkspaceFilesPanel,
  WorkspaceWindowFilesPanel,
} from "@/app/workspace/workspace-files-panels";
import {
  WorkspaceGitPanel,
  WorkspaceWindowGitPanel,
} from "@/app/workspace/workspace-git-panels";
import { WorkspaceTerminalView } from "@/app/workspace/workspace-terminal-view";
import { WorkspaceProcessesView } from "@/app/workspace/workspace-processes-view";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import {
  WorkspaceFilePreview,
  WorkspaceGitDiffTool,
} from "@/app/workspace/workspace-tool-results";
import {
  workspaceToolFilesTabId,
  workspaceToolGitTabId,
  workspaceToolProcessesTabId,
} from "@/app/workspace/workspace-tool-store";

export function WorkspaceToolContent({
  activeDynamicTab,
  activeTabId,
  api,
  root,
  surfaceActive,
  onBrowserTabChange,
  onOpenBrowser,
  onOpenFile,
}: {
  activeDynamicTab?: WorkspaceToolSurfaceDynamicTab;
  activeTabId: string;
  api: ApiClient;
  root: string;
  surfaceActive: boolean;
  onBrowserTabChange: (
    updater: (
      current: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
  onOpenBrowser: (url: string) => void;
  onOpenFile: (path: string) => void;
}) {
  if (activeTabId === workspaceToolFilesTabId) {
    return (
      <WorkspaceFilesPanel api={api} root={root} onOpenFile={onOpenFile} />
    );
  }
  if (activeTabId === workspaceToolGitTabId) {
    return <WorkspaceGitPanel api={api} root={root} />;
  }
  if (activeTabId === workspaceToolProcessesTabId) {
    return (
      <WorkspaceProcessesView
        active={surfaceActive}
        onOpenBrowser={onOpenBrowser}
      />
    );
  }
  if (!activeDynamicTab) {
    return <WorkspaceToolEmpty title="Unavailable" />;
  }

  switch (activeDynamicTab.kind) {
    case "browser":
      return (
        <WorkspaceBrowserTabContent
          active={surfaceActive}
          tab={activeDynamicTab}
          onBrowserTabChange={onBrowserTabChange}
        />
      );
    case "file-preview":
      return <WorkspaceFilePreview api={api} tab={activeDynamicTab} />;
    case "git-diff":
      return <WorkspaceGitDiffTool api={api} tab={activeDynamicTab} />;
    case "terminal":
      return (
        <div className="h-full min-h-0 overflow-hidden bg-background p-2">
          <WorkspaceTerminalView
            focusOnMount
            root={activeDynamicTab.root}
            sessionId={activeDynamicTab.sessionId}
          />
        </div>
      );
  }
}

export function WorkspaceToolWindowContent({
  activeDynamicTab,
  activeTabId,
  api,
  root,
  surfaceActive,
  onBrowserTabChange,
  onOpenBrowser,
  onOpenFile,
}: {
  activeDynamicTab?: WorkspaceToolSurfaceDynamicTab;
  activeTabId: string;
  api: ApiClient;
  root: string;
  surfaceActive: boolean;
  onBrowserTabChange: (
    updater: (
      current: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
  onOpenBrowser: (url: string) => void;
  onOpenFile: (path: string) => void;
}) {
  if (activeTabId === workspaceToolFilesTabId) {
    return <WorkspaceWindowFilesPanel api={api} root={root} />;
  }
  if (activeTabId === workspaceToolGitTabId) {
    return <WorkspaceWindowGitPanel api={api} root={root} />;
  }

  return (
    <WorkspaceToolContent
      activeDynamicTab={activeDynamicTab}
      activeTabId={activeTabId}
      api={api}
      root={root}
      surfaceActive={surfaceActive}
      onBrowserTabChange={onBrowserTabChange}
      onOpenBrowser={onOpenBrowser}
      onOpenFile={onOpenFile}
    />
  );
}
