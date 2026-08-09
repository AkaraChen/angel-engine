import type { WorkspaceToolSurfaceHost } from "@shared/workspace-tool-surface";
import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceToolContent } from "@/app/workspace/workspace-tool-content";
import { createPullRequestAction } from "@/app/workspace/workspace-create-pr-action";
import { WorkspaceCreatePullRequestController } from "@/app/workspace/workspace-git-create-pr";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import {
  ensureWorkspaceToolSurfaceEvents,
  useWorkspaceToolStore,
} from "@/app/workspace/workspace-tool-store";
import {
  useWorkspaceToolSurfaceModel,
  WorkspaceToolSurfaceProvider,
} from "@/app/workspace/workspace-tool-surface-model";
import { WorkspaceToolTabRail } from "@/app/workspace/workspace-tool-tab-navigation";
import { WorkspaceToolWindowShell } from "@/app/workspace/workspace-tool-window-shell";

interface WorkspaceToolSurfaceProps {
  active?: boolean;
  api: ApiClient;
  contextKey?: string | null;
  host: WorkspaceToolSurfaceHost;
  root?: string | null;
  trafficLightInset?: boolean;
}

export function WorkspaceToolSurface({
  active = true,
  api,
  contextKey,
  host,
  root,
  trafficLightInset = false,
}: WorkspaceToolSurfaceProps) {
  ensureWorkspaceToolSurfaceEvents();
  const model = useWorkspaceToolSurfaceModel({
    active,
    api,
    contextKey,
    host,
    root,
  });
  const storeHost = useWorkspaceToolStore((state) => state.host);
  const { t } = useTranslation();
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
        {host === "sidebar" ? (
          !is.nonEmptyString(model.contextKey) ||
          !is.nonEmptyString(model.root) ? (
            <WorkspaceToolEmpty
              title={t("workspace.tools.empty.noWorkspace")}
            />
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
          )
        ) : (
          <WorkspaceToolWindowShell
            root={model.root}
            trafficLightInset={trafficLightInset}
          />
        )}
      </section>
    </WorkspaceToolSurfaceProvider>
  );
}
