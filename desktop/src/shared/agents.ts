import { type as arkType } from "arktype";

export type AgentRuntime = "codex" | "kimi" | "opencode" | "claude";

export type AgentOption = {
  description: string;
  id: AgentRuntime;
  label: string;
};

export type AgentValueOption = {
  description?: string;
  label: string;
  value: string;
};

export type AgentSettings = {
  defaultRuntime: AgentRuntime;
};

export const AGENT_OPTIONS: AgentOption[] = [
  {
    description: "Codex app runtime with planning mode and effort controls.",
    id: "codex",
    label: "Codex",
  },
  {
    description: "Kimi runtime for Moonshot-based coding sessions.",
    id: "kimi",
    label: "Kimi",
  },
  {
    description: "OpenCode runtime for local OpenCode agent sessions.",
    id: "opencode",
    label: "OpenCode",
  },
  {
    description: "Claude Code runtime through the Claude Agent SDK.",
    id: "claude",
    label: "Claude Code",
  },
];

const agentRuntime = arkType("'codex' | 'kimi' | 'opencode' | 'claude'");

export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const settings =
    value && typeof value === "object" ? (value as Partial<AgentSettings>) : {};
  const parsed = agentRuntime(settings.defaultRuntime);
  const defaultRuntime = parsed instanceof arkType.errors ? "codex" : parsed;

  return {
    defaultRuntime,
  };
}
