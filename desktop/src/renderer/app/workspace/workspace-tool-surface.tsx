import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import {} from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceToolContent } from "@/app/workspace/workspace-tool-content";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import {
  useWorkspaceToolSurfaceModel,
  WorkspaceToolSurfaceProvider,
} from "@/app/workspace/workspace-tool-surface-model";
import { WorkspaceToolTabRail } from "@/app/workspace/workspace-tool-tab-navigation";

interface WorkspaceToolSurfaceProps {
  active?: boolean;
  api: ApiClient;
  contextKey?: string | null;
  root?: string | null;
}

export function WorkspaceToolSurface({
  active = true,
  api,
  contextKey,
  root,
}: WorkspaceToolSurfaceProps) {
  const model = useWorkspaceToolSurfaceModel({
    active,
    api,
    contextKey,
    root,
  });
  const { t } = useTranslation();
  return (
    <WorkspaceToolSurfaceProvider model={model}>
      <section
        className="
          flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden
          text-foreground select-none
        "
        tabIndex={-1}
      >
        {!is.nonEmptyString(model.contextKey) ||
        !is.nonEmptyString(model.root) ? (
          <WorkspaceToolEmpty title={t("workspace.tools.empty.noWorkspace")} />
        ) : (
          <>
            <WorkspaceToolTabRail orientation="horizontal" />
            <div
              aria-labelledby={`workspace-tool-tab-${model.activeTabId}`}
              className="min-h-0 flex-1 overflow-hidden"
              id="workspace-tool-panel"
              role="tabpanel"
            >
              <WorkspaceToolContent root={model.root} />
            </div>
          </>
        )}
      </section>
    </WorkspaceToolSurfaceProvider>
  );
}
