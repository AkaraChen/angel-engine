import { WorkspaceGitPanel } from "@/app/workspace/workspace-git-panels";
import { ChangeRequestPanel } from "@/features/change-request/change-request-panel";
import { HostedSourceControlPanel } from "@/features/source-control/components/hosted-source-control-panel";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { useTranslation } from "react-i18next";
import {
  WorkspaceFilePreview,
  WorkspaceGitDiffTool,
} from "@/app/workspace/workspace-tool-results";
import {
  workspaceToolGitTabId,
  workspaceToolPullRequestTabId,
} from "@/app/workspace/workspace-tool-store";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";

export function WorkspaceToolContent({ root }: { root: string }) {
  const { t } = useTranslation();
  const {
    activeDynamicTab,
    activeTabId,
    host,
    projectId,
  } = useWorkspaceToolSurface();
  const layout = host === "sidebar" ? "compact" : "split";

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
  if (!activeDynamicTab) {
    return <WorkspaceToolEmpty title={t("workspace.tools.unavailable")} />;
  }

  switch (activeDynamicTab.kind) {
    case "file-preview":
      return <WorkspaceFilePreview tab={activeDynamicTab} />;
    case "git-diff":
      return <WorkspaceGitDiffTool tab={activeDynamicTab} />;
  }
}
