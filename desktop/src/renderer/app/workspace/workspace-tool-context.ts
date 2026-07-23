import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";
import is from "@sindresorhus/is";

interface ResolveWorkspaceToolContextOptions {
  projectId?: string;
  projectRoot?: string;
  selectedChatId?: string;
  selectedChatProjectId?: string;
  workspaceMode: WorkspaceMode;
}

export interface WorkspaceToolContext {
  contextKey: string;
  root: string;
}

export function resolveWorkspaceToolContext({
  projectId,
  projectRoot,
  selectedChatId,
  selectedChatProjectId,
  workspaceMode,
}: ResolveWorkspaceToolContextOptions): WorkspaceToolContext | null {
  if (
    workspaceMode === "chat" ||
    !is.nonEmptyString(projectId) ||
    !is.nonEmptyString(projectRoot)
  ) {
    return null;
  }

  const contextKey =
    is.nonEmptyString(selectedChatId) &&
    is.nonEmptyString(selectedChatProjectId)
      ? `chat:${selectedChatId}`
      : `project:${projectId}:root:${projectRoot}`;

  return { contextKey, root: projectRoot };
}
