import type {
  Chat,
  ChatCreationLocationInput,
  ChatCwdInput,
} from "@angel-engine/daemon-api/chat";
import type { Db } from "../../platform/db";
import type { ProjectWorktreeCreateInput } from "@angel-engine/daemon-api/projects";

import is from "@sindresorhus/is";
import os from "node:os";
import { Effect } from "effect";
import { DaemonError } from "../../platform/errors";
import { createProjectWorktree } from "../projects/git";
import { getProject } from "../projects/repository";

export function cwdForChat(
  chat: Chat,
  projectId?: string | null,
): Effect.Effect<string, DaemonError, Db> {
  return Effect.gen(function* () {
    if (chat.cwd !== null) return chat.cwd;

    const projectCwd = yield* cwdForProjectId(projectId ?? chat.projectId);
    return projectCwd ?? standaloneChatCwd();
  });
}

/**
 * The fields that decide where a brand-new chat runs. Both `POST /api/chats`
 * and the legacy send route resolve through this one rule, so a worktree chat
 * materializes its worktree the same way whichever route created it.
 */
export type ChatCwdResolutionInput = ChatCreationLocationInput &
  ChatCwdInput & {
    projectId?: string | null;
    worktreeSetupApproval?: string;
    worktreeRef?: ProjectWorktreeCreateInput["ref"];
  };

export function cwdForNewChat(
  input: ChatCwdResolutionInput,
  signal?: AbortSignal,
): Effect.Effect<string, DaemonError, Db> {
  return Effect.gen(function* () {
    if (is.nonEmptyString(input.cwd)) return input.cwd;

    if (input.creationLocation === "worktree") {
      if (!is.nonEmptyString(input.projectId)) {
        return yield* Effect.fail(DaemonError.projectRequiredForWorktree());
      }
      const worktree = yield* createProjectWorktree(
        {
          projectId: input.projectId,
          setupApproval: input.worktreeSetupApproval,
          ref: input.worktreeRef,
        },
        signal,
      );
      return worktree.cwd;
    }

    return yield* cwdForProjectOrStandalone(input.projectId);
  });
}

export function cwdForProjectOrStandalone(
  projectId: string | null | undefined,
): Effect.Effect<string, DaemonError, Db> {
  return Effect.map(
    cwdForProjectId(projectId),
    (projectCwd) => projectCwd ?? standaloneChatCwd(),
  );
}

function cwdForProjectId(
  projectId: string | null | undefined,
): Effect.Effect<string | undefined, DaemonError, Db> {
  return Effect.gen(function* () {
    if (!is.nonEmptyString(projectId)) return undefined;
    const project = yield* getProject(projectId);
    if (!project) {
      return yield* Effect.fail(
        DaemonError.projectNotFound(
          `Project path not found for project id: ${projectId}`,
        ),
      );
    }
    return project.path;
  });
}

export function standaloneChatCwd() {
  return os.homedir();
}
