import type { PiAgentSession as DesktopPiAgentSession } from "@angel-engine/pi-client";
import type { Db } from "../../platform/db";

import { ClaudeCodeSession } from "@angel-engine/claude-client";
import { createRuntimeOptions } from "@angel-engine/client-napi";
import { Effect } from "effect";
import { isCustomAgentRuntime } from "@angel-engine/daemon-api/agents";
import { DaemonError } from "../../platform/errors";
import { getCustomAgent } from "../agents/repository";
import { isHostControlEnabled } from "../host-control";
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
          environment: mergeHostControlEnvironment(agent.environment),
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
        environment: mergeHostControlEnvironment(),
      }),
    );
  });
}

const HOST_CONTROL_ENV_KEYS = [
  "ANGEL_DAEMON_URL",
  "ANGEL_DAEMON_TOKEN",
  "ANGELCTL_BIN",
  "ANGELCTL_BIN_DIR",
  "ANGEL_HOST_SKILL_DIR",
  "ANGEL_HOST_SKILL_ROOT",
  "PATH",
] as const;

/**
 * Merge host-control env (daemon URL/token + angelctl PATH) into agent spawn
 * env. Values already set by the custom agent win so operators can override.
 * Skill-first path only — does not configure MCP.
 *
 * Relies on `installHostControl` having written these onto `process.env`
 * after the daemon handshake.
 */
function mergeHostControlEnvironment(
  existing: Array<{ name: string; value: string }> | undefined = undefined,
): Array<{ name: string; value: string }> | undefined {
  if (!isHostControlEnabled()) {
    return existing;
  }

  const byName = new Map<string, string>();
  for (const key of HOST_CONTROL_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      byName.set(key, value);
    }
  }
  if (byName.size === 0) {
    return existing;
  }
  for (const variable of existing ?? []) {
    byName.set(variable.name, variable.value);
  }
  return [...byName.entries()].map(([name, value]) => ({ name, value }));
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
