import type {
  ChatSummary,
  DaemonChat,
  DaemonProject,
} from "@/platform/chat-types";

/**
 * Projects the raw daemon `Chat` list into the mobile row model, deriving the
 * project name and worktree branch label the way the desktop sidebar does (see
 * `desktop/src/renderer/features/chat/worktree-grouping.ts`): a chat whose `cwd`
 * differs from its project root is running in a worktree, labelled by the last
 * path segment; otherwise it sits on the project's main worktree.
 */
export function deriveChatSummaries(
  chats: DaemonChat[],
  projects: DaemonProject[],
): ChatSummary[] {
  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );

  return chats
    .filter((chat) => !chat.archived)
    .map((chat) => deriveChatSummary(chat, projectsById));
}

function deriveChatSummary(
  chat: DaemonChat,
  projectsById: Map<string, DaemonProject>,
): ChatSummary {
  const project =
    chat.projectId === null ? undefined : projectsById.get(chat.projectId);
  const worktreeCwd = chatWorktreeCwd(chat.cwd, project?.path);

  return {
    id: chat.id,
    title: chat.title,
    runtime: chat.runtime,
    projectId: chat.projectId,
    projectName: project === undefined ? null : basename(project.path),
    worktreeBranch: worktreeCwd === undefined ? null : basename(worktreeCwd),
    pinned: chat.pinned,
    updatedAt: chat.updatedAt,
  };
}

/** The chat's worktree cwd, or undefined when it runs on the project root. */
function chatWorktreeCwd(
  cwd: string | null,
  projectPath: string | undefined,
): string | undefined {
  const normalizedCwd = normalizePath(cwd);
  const normalizedProject = normalizePath(projectPath);
  if (normalizedCwd === undefined) return undefined;
  return normalizedCwd === normalizedProject ? undefined : normalizedCwd;
}

export function basename(pathValue: string): string {
  const parts = pathValue.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? pathValue;
}

function normalizePath(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.replace(/[/\\]+$/, "");
  return trimmed.length > 0 ? trimmed : value.length > 0 ? value : undefined;
}
