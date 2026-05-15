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

export interface AgentOption {
  description: string;
  id: AgentRuntime;
  label: string;
}

export interface AgentValueOption {
  description?: string;
  label: string;
  value: string;
}

export interface AgentSettings {
  defaultRuntime: AgentRuntime;
  enabledRuntimes: AgentRuntime[];
}

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

const DEFAULT_AGENT_RUNTIME: AgentRuntime = "codex";

export function getEnabledAgentOptions(settings: AgentSettings): AgentOption[] {
  const enabled = new Set(settings.enabledRuntimes);
  return AGENT_OPTIONS.filter((agent) => enabled.has(agent.id));
}

export function resolveEnabledAgentRuntime(
  settings: AgentSettings,
  runtime?: AgentRuntime,
): AgentRuntime {
  return runtime && settings.enabledRuntimes.includes(runtime)
    ? runtime
    : settings.defaultRuntime;
}

export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const settings =
    value && typeof value === "object" ? (value as Partial<AgentSettings>) : {};
  const parsed = agentRuntime(settings.defaultRuntime);
  const parsedDefault =
    parsed instanceof arkType.errors ? DEFAULT_AGENT_RUNTIME : parsed;
  const enabledRuntimes = sanitizeEnabledRuntimes(
    settings.enabledRuntimes,
    parsedDefault,
  );
  const defaultRuntime = enabledRuntimes.includes(parsedDefault)
    ? parsedDefault
    : enabledRuntimes[0];

  return {
    defaultRuntime,
    enabledRuntimes,
  };
}

function sanitizeEnabledRuntimes(
  value: unknown,
  fallbackRuntime: AgentRuntime,
): AgentRuntime[] {
  if (!Array.isArray(value)) {
    return AGENT_OPTIONS.map((agent) => agent.id);
  }

  const parsedRuntimes = new Set<AgentRuntime>();
  for (const item of value) {
    const parsed = agentRuntime(item);
    if (!(parsed instanceof arkType.errors)) {
      parsedRuntimes.add(parsed);
    }
  }

  const enabledRuntimes = AGENT_OPTIONS.flatMap((agent) =>
    parsedRuntimes.has(agent.id) ? [agent.id] : [],
  );

  return enabledRuntimes.length > 0 ? enabledRuntimes : [fallbackRuntime];
}
