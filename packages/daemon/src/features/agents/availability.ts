import type {
  AgentOption,
  AgentRuntime,
} from "@angel-engine/daemon-api/agents";

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

export async function listAvailableAgents(): Promise<AgentOption[]> {
  const availability = await Promise.all(
    AGENT_OPTIONS.map(async (agent) => ({
      agent,
      available: await commandExists(runtimeCommands[agent.id]()),
    })),
  );

  const builtinAgents = availability.flatMap(({ agent, available }) =>
    available ? [agent] : [],
  );
  const availableCustomAgents = await listCustomAgents();
  const customAgents = availableCustomAgents.map((agent) => ({
    description: `${agent.command} ${agent.args.join(" ")}`.trim(),
    id: agent.id,
    label: agent.label,
  }));

  return [...builtinAgents, ...customAgents];
}

async function commandExists(command: string): Promise<boolean> {
  return (await which(command, { nothrow: true })) !== null;
}
