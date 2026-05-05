export type AgentRuntime = "codex" | "kimi" | "opencode";

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
];

export function normalizeAgentRuntime(
  runtime: string | null | undefined,
): AgentRuntime {
  const trimmed = runtime?.trim().toLowerCase();
  if (trimmed === "kimi") return "kimi";
  if (
    trimmed === "opencode" ||
    trimmed === "open-code" ||
    trimmed === "open code"
  ) {
    return "opencode";
  }
  return "codex";
}

export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const settings =
    value && typeof value === "object" ? (value as Partial<AgentSettings>) : {};
  const defaultRuntime = normalizeAgentRuntime(settings.defaultRuntime);

  return {
    defaultRuntime,
  };
}
