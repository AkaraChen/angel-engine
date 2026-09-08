import { useEffect } from "react";

import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";

export function WorkspaceToolContextBridge({
  chatId,
  contextKey,
  projectId,
  root,
}: {
  chatId?: string | null;
  contextKey?: string | null;
  projectId?: string | null;
  root?: string | null;
}) {
  const syncWorkspaceToolContext = useWorkspaceToolStore(
    (state) => state.syncWorkspaceToolContext,
  );
  useEffect(() => {
    syncWorkspaceToolContext({ chatId, contextKey, projectId, root });
  }, [chatId, contextKey, projectId, root, syncWorkspaceToolContext]);
  return null;
}

export { WorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface";
