import type { Chat, ChatSendInput } from "../../../shared/chat";

import is from "@sindresorhus/is";
import { app } from "electron";
import { createProjectWorktree } from "../projects/git";
import { getProject } from "../projects/repository";

export function cwdForChat(chat: Chat, projectId?: string | null): string {
  return (
    chat.cwd ??
    cwdForProjectId(projectId ?? chat.projectId) ??
    standaloneChatCwd()
  );
}

export async function cwdForNewChat(input: ChatSendInput) {
  if (is.nonEmptyString(input.cwd)) return input.cwd;

  if (input.creationLocation === "worktree") {
    if (!is.nonEmptyString(input.projectId)) {
      throw new Error("Project is required to create a git worktree.");
    }
    return (await createProjectWorktree({ projectId: input.projectId })).cwd;
  }

  return cwdForProjectOrStandalone(input.projectId);
}

export function cwdForProjectOrStandalone(
  projectId: string | null | undefined,
) {
  return cwdForProjectId(projectId) ?? standaloneChatCwd();
}

function cwdForProjectId(projectId: string | null | undefined) {
  if (!is.nonEmptyString(projectId)) return undefined;
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project path not found for project id: ${projectId}`);
  }
  return project.path;
}

export function standaloneChatCwd() {
  return app.getPath("home");
}
