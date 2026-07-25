import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { PathLauncherTargetRef } from "@shared/path-launcher";
import type { PowerDraftWorktree } from "@/features/chat/state/chat-tab-store";

import is from "@sindresorhus/is";
import { chatWorktreeGroupKey } from "@/features/chat/worktree-grouping";

interface WorkspacePathLauncherInput {
  chats: ReadonlyArray<Pick<Chat, "cwd" | "id" | "projectId">>;
  draftProjectId?: string;
  projects: ReadonlyArray<Pick<Project, "id" | "path">>;
  selectedChat?: Pick<Chat, "id" | "projectId">;
  worktree?: PowerDraftWorktree;
}

export function resolveWorkspacePathLauncherTarget({
  chats,
  draftProjectId,
  projects,
  selectedChat,
  worktree,
}: WorkspacePathLauncherInput): PathLauncherTargetRef | undefined {
  if (selectedChat && is.nonEmptyString(selectedChat.projectId)) {
    return {
      chatId: selectedChat.id,
      projectId: selectedChat.projectId,
    };
  }

  if (worktree !== undefined) {
    const project = projects.find(({ id }) => id === worktree.projectId);
    if (project === undefined) return undefined;

    const worktreeChat = chats.find(
      (chat) => chatWorktreeGroupKey(chat, project.path) === worktree.groupKey,
    );
    if (worktreeChat !== undefined) {
      return {
        chatId: worktreeChat.id,
        projectId: worktree.projectId,
      };
    }

    const mainGroupKey = chatWorktreeGroupKey(
      { cwd: project.path, projectId: project.id },
      project.path,
    );
    return worktree.groupKey === mainGroupKey
      ? { projectId: worktree.projectId }
      : undefined;
  }

  return is.nonEmptyString(draftProjectId)
    ? { projectId: draftProjectId }
    : undefined;
}
