import type { Chat, ChatCwdInput } from "@angel-engine/daemon-api/chat";
import type { Db } from "../../platform/db";

import is from "@sindresorhus/is";
import os from "node:os";
import { Effect } from "effect";
import { DaemonError } from "../../platform/errors";
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

export type ChatCwdResolutionInput = ChatCwdInput & {
  projectId?: string | null;
};

export function cwdForNewChat(
  input: ChatCwdResolutionInput,
): Effect.Effect<string, DaemonError, Db> {
  return Effect.gen(function* () {
    if (is.nonEmptyString(input.cwd)) return input.cwd;

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
