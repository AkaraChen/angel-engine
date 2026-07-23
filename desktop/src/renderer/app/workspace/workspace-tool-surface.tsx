import type { WorkspaceToolSurfaceHost } from "@shared/workspace-tool-surface";
import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import { useEffect, useRef } from "react";

import { WorkspaceToolContent } from "@/app/workspace/workspace-tool-content";
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

  return (
    <WorkspaceToolSurfaceProvider model={model}>
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
            <WorkspaceToolEmpty title="No workspace for this chat" />
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
