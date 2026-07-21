import type { PiAgentSession as DesktopPiAgentSession } from "@angel-engine/pi-client";
import type { Db } from "../../platform/db";

import { ClaudeCodeSession } from "@angel-engine/claude-client";
import { createRuntimeOptions } from "@angel-engine/client-napi";
import { Effect } from "effect";
import { isCustomAgentRuntime } from "@angel-engine/daemon-api/agents";
import { DaemonError } from "../../platform/errors";
import { getCustomAgent } from "../agents/repository";
import { DesktopAngelSession } from "./desktop-angel-session";

export type DesktopChatSession =
  | DesktopAngelSession
  | ClaudeCodeSession
  | DesktopPiAgentSession;

/** Dedupes concurrent session creation per chat id in the promise world. */
export async function getOrCreateChatSession<T>(
  chatId: string,
  sessions: Map<string, T>,
  creations: Map<string, Promise<T>>,
  createSession: () => Promise<T>,
): Promise<T> {
  const existing = sessions.get(chatId);
  if (existing !== undefined) return existing;

  const pending = creations.get(chatId);
  if (pending !== undefined) return pending;

  const creation = createSession()
    .then((session) => {
      sessions.set(chatId, session);
      return session;
    })
    .finally(() => {
      creations.delete(chatId);
    });
  creations.set(chatId, creation);
  return creation;
}

export function createChatSession(
  runtime?: string,
): Effect.Effect<DesktopChatSession, DaemonError, Db> {
  return Effect.gen(function* () {
    if (runtime === "claude") {
      return new ClaudeCodeSession();
    }
    if (runtime === "pi") {
      return yield* createPiAgentSession();
    }

    if (isCustomAgentRuntime(runtime)) {
      const agent = yield* getCustomAgent(runtime);
      if (!agent) {
        return yield* Effect.fail(
          DaemonError.customAgentNotFound(`Custom agent not found: ${runtime}`),
        );
      }
      return new DesktopAngelSession(
        createRuntimeOptions("custom", {
          args: agent.args,
          auth: {
            autoAuthenticate: agent.autoAuthenticate,
            needAuth: agent.needAuth,
          },
          command: agent.command,
          environment: agent.environment,
          clientName: "angel-engine",
          clientTitle: "Angel Engine",
          processLabel: agent.label,
        }),
      );
    }

    return new DesktopAngelSession(
      createRuntimeOptions(runtime ?? null, {
        clientName: "angel-engine",
        clientTitle: "Angel Engine",
      }),
    );
  });
}

function createPiAgentSession(): Effect.Effect<
  DesktopPiAgentSession,
  DaemonError
> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.sessionFailed(cause),
    try: async () => {
      const { PiAgentSession } = await import("@angel-engine/pi-client");
      return new PiAgentSession();
    },
  });
}
