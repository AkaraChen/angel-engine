import { type as arkType } from "arktype";

export type AgentRuntime =
  | "codex"
  | "kimi"
  | "opencode"
  | "qoder"
  | "copilot"
  | "gemini"
  | "cursor"
  | "cline"
  | "claude";

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
    description: "Qoder CLI through its ACP server.",
    id: "qoder",
    label: "Qoder",
  },
  {
    description: "GitHub Copilot CLI through its ACP server.",
    id: "copilot",
    label: "GitHub Copilot",
  },
  {
    description: "Gemini CLI through its ACP server.",
    id: "gemini",
    label: "Gemini",
  },
  {
    description: "Cursor CLI through its ACP server.",
    id: "cursor",
    label: "Cursor",
  },
  {
    description: "Cline CLI through its ACP server.",
    id: "cline",
    label: "Cline",
  },
  {
    description: "Claude Code runtime through the Claude Agent SDK.",
    id: "claude",
    label: "Claude Code",
  },
];

const agentRuntime = arkType(
  "'codex' | 'kimi' | 'opencode' | 'qoder' | 'copilot' | 'gemini' | 'cursor' | 'cline' | 'claude'",
);

export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const settings =
    value && typeof value === "object" ? (value as Partial<AgentSettings>) : {};
  const parsed = agentRuntime(settings.defaultRuntime);
  const defaultRuntime = parsed instanceof arkType.errors ? "codex" : parsed;

  return {
    defaultRuntime,
  };
}
