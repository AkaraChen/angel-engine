import type { Chat, ChatSendInput } from "@angel-engine/daemon-api/chat";

import is from "@sindresorhus/is";
import os from "node:os";
import { createProjectWorktree } from "../projects/git";
import { getProject } from "../projects/repository";

export async function cwdForChat(
  chat: Chat,
  projectId?: string | null,
): Promise<string> {
  if (chat.cwd !== null) return chat.cwd;

  const projectCwd = await cwdForProjectId(projectId ?? chat.projectId);
  return projectCwd ?? standaloneChatCwd();
}

export async function cwdForNewChat(input: ChatSendInput) {
  if (is.nonEmptyString(input.cwd)) return input.cwd;

  if (input.creationLocation === "worktree") {
    if (!is.nonEmptyString(input.projectId)) {
      throw new Error("Project is required to create a git worktree.");
    }
    const worktree = await createProjectWorktree({
      projectId: input.projectId,
    });
    return worktree.cwd;
  }

  return cwdForProjectOrStandalone(input.projectId);
}

export async function cwdForProjectOrStandalone(
  projectId: string | null | undefined,
): Promise<string> {
  const projectCwd = await cwdForProjectId(projectId);
  return projectCwd ?? standaloneChatCwd();
}

async function cwdForProjectId(projectId: string | null | undefined) {
  if (!is.nonEmptyString(projectId)) return undefined;
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project path not found for project id: ${projectId}`);
  }
  return project.path;
}

export function standaloneChatCwd() {
  return os.homedir();
}
