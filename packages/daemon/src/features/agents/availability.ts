import type {
  AgentOption,
  AgentRuntime,
} from "@angel-engine/daemon-api/agents";
import type { Db } from "../../platform/db";
import type { DaemonError } from "../../platform/errors";

import { Effect } from "effect";
import which from "which";
import { AGENT_OPTIONS } from "@angel-engine/daemon-api/agents";
import { listCustomAgents } from "./repository";
import {
  readinessForCustomAgent,
  readinessFromBinaryPresence,
  withReadiness,
} from "./readiness";

const runtimeCommands: Record<AgentRuntime, () => string> = {
  claude: () =>
    process.env.CLAUDE_CODE_PATH ?? process.env.CLAUDE_PATH ?? "claude",
  cline: () => "cline",
  codex: () => "codex",
  copilot: () => "copilot",
  gemini: () => "gemini",
  kimi: () => "kimi",
  opencode: () => "opencode",
  pi: () => "pi",
  qoder: () => "qodercli",
};

export function listAvailableAgents(): Effect.Effect<
  AgentOption[],
  DaemonError,
  Db
> {
  return Effect.gen(function* () {
    const availability = yield* Effect.all(
      AGENT_OPTIONS.map((agent) =>
        Effect.map(commandProbe(runtimeCommands[agent.id]()), (probe) => ({
          agent,
          probe,
        })),
      ),
      { concurrency: "unbounded" },
    );

    // Keep unavailable built-ins in the catalog so Settings can explain readiness
    // instead of silently dropping them when the binary is missing.
    const builtinAgents = availability.map(({ agent, probe }) =>
      withReadiness(
        agent,
        readinessFromBinaryPresence({
          available: probe.available,
          command: probe.command,
          probeError: probe.error,
        }),
      ),
    );
    const availableCustomAgents = yield* listCustomAgents();
    const customAgents = yield* Effect.all(
      availableCustomAgents.map((agent) =>
        Effect.map(commandProbe(agent.command), (probe) =>
          withReadiness(
            {
              description: `${agent.command} ${agent.args.join(" ")}`.trim(),
              id: agent.id,
              label: agent.label,
            },
            readinessForCustomAgent({
              agent,
              available: probe.available,
              probeError: probe.error,
            }),
          ),
        ),
      ),
      { concurrency: "unbounded" },
    );

    return [...builtinAgents, ...customAgents];
  });
}

function commandProbe(
  command: string,
): Effect.Effect<{ available: boolean; command: string; error?: string }> {
  return Effect.promise(async () => {
    try {
      const resolved = await which(command, { nothrow: true });
      return {
        available: resolved !== null,
        command,
      };
    } catch (error: unknown) {
      return {
        available: false,
        command,
        error: error instanceof Error ? error.message : "Command probe failed.",
      };
    }
  });
}
