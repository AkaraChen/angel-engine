import { WorkspaceBrowserTabContent } from "@/app/workspace/workspace-browser-tab";
import { WorkspaceFilesPanel } from "@/app/workspace/workspace-files-panels";
import { WorkspaceGitPanel } from "@/app/workspace/workspace-git-panels";
import { WorkspaceProcessesView } from "@/app/workspace/workspace-processes-view";
import { WorkspaceTerminalView } from "@/app/workspace/workspace-terminal-view";
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
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";

export function WorkspaceToolContent({ root }: { root: string }) {
  const {
    active,
    activeDynamicTab,
    activeTabId,
    host,
    openBrowserTab,
    updateSnapshot,
  } = useWorkspaceToolSurface();
  const layout = host === "sidebar" ? "compact" : "split";

  if (activeTabId === workspaceToolFilesTabId) {
    return <WorkspaceFilesPanel layout={layout} root={root} />;
  }
  if (activeTabId === workspaceToolGitTabId) {
    return <WorkspaceGitPanel layout={layout} root={root} />;
  }
  if (activeTabId === workspaceToolProcessesTabId) {
    return (
      <WorkspaceProcessesView
        active={active}
        layout={layout}
        onOpenBrowser={openBrowserTab}
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
          active={active}
          tab={activeDynamicTab}
          onBrowserTabChange={updateSnapshot}
        />
      );
    case "file-preview":
      return <WorkspaceFilePreview tab={activeDynamicTab} />;
    case "git-diff":
      return <WorkspaceGitDiffTool tab={activeDynamicTab} />;
    case "terminal":
      return (
        <div className="h-full min-h-0 overflow-hidden p-2">
          <WorkspaceTerminalView
            focusOnMount
            root={activeDynamicTab.root}
            sessionId={activeDynamicTab.sessionId}
          />
        </div>
      );
  }
}
