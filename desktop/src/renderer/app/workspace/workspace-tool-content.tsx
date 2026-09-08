import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { useTranslation } from "react-i18next";
import {
  WorkspaceFilePreview,
  WorkspaceGitDiffTool,
} from "@/app/workspace/workspace-tool-results";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";

export function WorkspaceToolContent({ root: _root }: { root: string }) {
  const { t } = useTranslation();
  const { activeDynamicTab } = useWorkspaceToolSurface();
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
