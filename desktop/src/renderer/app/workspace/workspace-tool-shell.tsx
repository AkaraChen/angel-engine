import { useEffect } from "react";

import {
  ensureWorkspaceToolSurfaceEvents,
  useWorkspaceToolStore,
} from "@/app/workspace/workspace-tool-store";
import { WorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface";
import { WorkspaceToolWindowTitleBridge } from "@/app/workspace/workspace-tool-surface-header";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { getApiClient } from "@/platform/api-client";

export function WorkspaceToolContextBridge({
  chatId,
  contextKey,
  root,
}: {
  chatId?: string | null;
  contextKey?: string | null;
  root?: string | null;
}) {
  const syncWorkspaceToolContext = useWorkspaceToolStore(
    (state) => state.syncWorkspaceToolContext,
  );

  useEffect(() => {
    syncWorkspaceToolContext({ chatId, contextKey, root });
  }, [chatId, contextKey, root, syncWorkspaceToolContext]);

  return null;
}

export function WorkspaceToolWindowPage() {
  ensureWorkspaceToolSurfaceEvents();
  const api = getApiClient();
  const root = useWorkspaceToolStore((state) => state.context.root);
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const trafficLightInset = window.desktopEnvironment.platform === "darwin";

  return (
    <div
      className="flex h-screen min-h-0 bg-background text-foreground"
      data-workspace-mode={workspaceMode}
    >
      <WorkspaceToolWindowTitleBridge root={root} />
      <WorkspaceToolSurface
        api={api}
        host="window"
        trafficLightInset={trafficLightInset}
      />
    </div>
  );
}
