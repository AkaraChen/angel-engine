import type { AgentOption, AgentRuntime } from "../../../shared/agents";

import which from "which";
import { AGENT_OPTIONS } from "../../../shared/agents";

const runtimeCommands: Record<AgentRuntime, () => string> = {
  claude: () =>
    process.env.CLAUDE_CODE_PATH ?? process.env.CLAUDE_PATH ?? "claude",
  cline: () => "cline",
  codex: () => "codex",
  copilot: () => "copilot",
  cursor: () => "agent",
  gemini: () => "gemini",
  kimi: () => "kimi",
  opencode: () => "opencode",
  qoder: () => "qodercli",
};

export async function listAvailableAgents(): Promise<AgentOption[]> {
  const availability = await Promise.all(
    AGENT_OPTIONS.map(async (agent) => ({
      agent,
      available: await commandExists(runtimeCommands[agent.id]()),
    })),
  );

  return availability.flatMap(({ agent, available }) =>
    available ? [agent] : [],
  );
}

async function commandExists(command: string): Promise<boolean> {
  return (await which(command, { nothrow: true })) !== null;
}
