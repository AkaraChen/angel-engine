import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceToolContent } from "@/app/workspace/workspace-tool-content";
import { createPullRequestAction } from "@/app/workspace/workspace-create-pr-action";
import { WorkspaceCreatePullRequestController } from "@/app/workspace/workspace-git-create-pr";
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
  const surfaceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active || !is.nonEmptyString(model.root)) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        createPullRequestAction.execute();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, model.root]);

  return (
    <WorkspaceToolSurfaceProvider model={model}>
      {active && is.nonEmptyString(model.root) ? (
        <WorkspaceCreatePullRequestController
          api={api}
          contextKey={model.contextKey}
          key={model.root}
          projectId={model.projectId}
          root={model.root}
        />
      ) : null}
      <section
        className="
          flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden
          text-foreground select-none
        "
        ref={surfaceRef}
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
