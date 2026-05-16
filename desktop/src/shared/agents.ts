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

export interface AgentRuntimePreference {
  mode?: string;
  model?: string;
  permissionMode?: string;
  reasoningEffort?: string;
}

export interface AgentSettings {
  enabledRuntimes: AgentRuntime[];
  lastRuntime?: AgentRuntime;
  runtimePreferences: Partial<Record<AgentRuntime, AgentRuntimePreference>>;
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

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return !(agentRuntime(value) instanceof arkType.errors);
}

export function getEnabledAgentOptions(settings: AgentSettings): AgentOption[] {
  const enabled = new Set(settings.enabledRuntimes);
  return AGENT_OPTIONS.filter((agent) => enabled.has(agent.id));
}

export function resolveEnabledAgentRuntime(
  settings: AgentSettings,
  runtime?: AgentRuntime,
): AgentRuntime {
  if (runtime && settings.enabledRuntimes.includes(runtime)) {
    return runtime;
  }

  if (
    settings.lastRuntime &&
    settings.enabledRuntimes.includes(settings.lastRuntime)
  ) {
    return settings.lastRuntime;
  }

  return settings.enabledRuntimes[0];
}

export function sanitizeAgentRuntimePreference(
  value: unknown,
): AgentRuntimePreference {
  if (!value || typeof value !== "object") return {};
  const input = value as Partial<AgentRuntimePreference>;
  const preference: AgentRuntimePreference = {};
  const model = sanitizePreferenceValue(input.model);
  const reasoningEffort = sanitizePreferenceValue(input.reasoningEffort);
  const mode = sanitizePreferenceValue(input.mode);
  const permissionMode = sanitizePreferenceValue(input.permissionMode);

  if (model) preference.model = model;
  if (reasoningEffort) preference.reasoningEffort = reasoningEffort;
  if (mode) preference.mode = mode;
  if (permissionMode) preference.permissionMode = permissionMode;

  return preference;
}

export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const settings =
    value && typeof value === "object" ? (value as Partial<AgentSettings>) : {};
  const legacySettings =
    value && typeof value === "object"
      ? (value as Partial<{ defaultRuntime: unknown }>)
      : {};
  const parsedLastRuntime = agentRuntime(settings.lastRuntime);
  const parsedLegacyDefault = agentRuntime(legacySettings.defaultRuntime);
  const fallbackRuntime =
    parsedLastRuntime instanceof arkType.errors
      ? parsedLegacyDefault instanceof arkType.errors
        ? DEFAULT_AGENT_RUNTIME
        : parsedLegacyDefault
      : parsedLastRuntime;
  const enabledRuntimes = sanitizeEnabledRuntimes(
    settings.enabledRuntimes,
    fallbackRuntime,
  );
  const lastRuntime = enabledRuntimes.includes(fallbackRuntime)
    ? fallbackRuntime
    : enabledRuntimes[0];

  return {
    enabledRuntimes,
    lastRuntime,
    runtimePreferences: sanitizeRuntimePreferences(settings.runtimePreferences),
  };
}

export function rememberAgentRuntimePreference(
  settings: AgentSettings,
  runtime: AgentRuntime,
  preference?: AgentRuntimePreference,
): AgentSettings {
  return sanitizeAgentSettings({
    ...settings,
    lastRuntime: runtime,
    runtimePreferences: {
      ...settings.runtimePreferences,
      ...(preference ? { [runtime]: preference } : {}),
    },
  });
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

function sanitizeRuntimePreferences(
  value: unknown,
): AgentSettings["runtimePreferences"] {
  if (!value || typeof value !== "object") return {};
  const input = value as Partial<
    Record<AgentRuntime, Partial<AgentRuntimePreference>>
  >;
  const preferences: AgentSettings["runtimePreferences"] = {};

  for (const agent of AGENT_OPTIONS) {
    const preference = sanitizeAgentRuntimePreference(input[agent.id]);
    if (Object.keys(preference).length > 0) {
      preferences[agent.id] = preference;
    }
  }

  return preferences;
}

function sanitizePreferenceValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
