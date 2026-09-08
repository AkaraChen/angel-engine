import is from "@sindresorhus/is";

interface ResolveWorkspaceToolContextOptions {
  projectId?: string;
  projectRoot?: string;
  selectedChatId?: string;
  selectedChatProjectId?: string;
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
