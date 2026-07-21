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
        Effect.map(commandExists(runtimeCommands[agent.id]()), (available) => ({
          agent,
          available,
        })),
      ),
      { concurrency: "unbounded" },
    );

    const builtinAgents = availability.flatMap(({ agent, available }) =>
      available ? [agent] : [],
    );
    const availableCustomAgents = yield* listCustomAgents();
    const customAgents = availableCustomAgents.map((agent) => ({
      description: `${agent.command} ${agent.args.join(" ")}`.trim(),
      id: agent.id,
      label: agent.label,
    }));

    return [...builtinAgents, ...customAgents];
  });
}

function commandExists(command: string): Effect.Effect<boolean> {
  return Effect.promise(async () => {
    return (await which(command, { nothrow: true })) !== null;
  });
}
