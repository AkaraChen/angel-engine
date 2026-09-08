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
}: ResolveWorkspaceToolContextOptions): WorkspaceToolContext | null {
  if (!is.nonEmptyString(projectRoot)) return null;

  const contextKey = is.nonEmptyString(selectedChatId)
    ? `chat:${selectedChatId}`
    : is.nonEmptyString(projectId)
      ? `project:${projectId}:root:${projectRoot}`
      : `draft:root:${projectRoot}`;

  return { contextKey, root: projectRoot };
}
