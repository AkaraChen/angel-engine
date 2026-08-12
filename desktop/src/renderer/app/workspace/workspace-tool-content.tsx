import { WorkspaceBrowserTabContent } from "@/app/workspace/workspace-browser-tab";
import { WorkspaceFilesPanel } from "@/app/workspace/workspace-files-panels";
import { WorkspaceGitPanel } from "@/app/workspace/workspace-git-panels";
import { WorkspaceProcessesView } from "@/app/workspace/workspace-processes-view";
import { ChangeRequestPanel } from "@/features/change-request/change-request-panel";
import { HostedSourceControlPanel } from "@/features/source-control/components/hosted-source-control-panel";
import { WorkspaceTerminalView } from "@/app/workspace/workspace-terminal-view";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { useTranslation } from "react-i18next";
import {
  WorkspaceFilePreview,
  WorkspaceGitDiffTool,
} from "@/app/workspace/workspace-tool-results";
import {
  workspaceToolFilesTabId,
  workspaceToolGitTabId,
  workspaceToolPullRequestTabId,
  workspaceToolProcessesTabId,
} from "@/app/workspace/workspace-tool-store";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";

export function WorkspaceToolContent({ root }: { root: string }) {
  const { t } = useTranslation();
  const {
    active,
    activeDynamicTab,
    activeTabId,
    host,
    openBrowserTab,
    projectId,
    updateSnapshot,
  } = useWorkspaceToolSurface();
  const layout = host === "sidebar" ? "compact" : "split";

  if (activeTabId === workspaceToolFilesTabId) {
    return <WorkspaceFilesPanel layout={layout} root={root} />;
  }
  if (activeTabId === workspaceToolGitTabId) {
    return <WorkspaceGitPanel layout={layout} root={root} />;
  }
  if (activeTabId === workspaceToolPullRequestTabId) {
    return (
      <HostedSourceControlPanel projectId={projectId}>
        <ChangeRequestPanel projectId={projectId} root={root} />
      </HostedSourceControlPanel>
    );
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
    return <WorkspaceToolEmpty title={t("workspace.tools.unavailable")} />;
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
        <WorkspaceTerminalView
          focusOnMount
          root={activeDynamicTab.root}
          sessionId={activeDynamicTab.sessionId}
        />
      );
  }
}
