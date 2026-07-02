import is from "@sindresorhus/is";
import { type as arkType } from "arktype";

export type AgentRuntime =
  | CustomAgentRuntime
  | "codex"
  | "kimi"
  | "opencode"
  | "qoder"
  | "copilot"
  | "gemini"
  | "cline"
  | "claude";

export type BuiltinAgentRuntime = Exclude<AgentRuntime, CustomAgentRuntime>;
export type CustomAgentRuntime = `custom:${string}`;

export interface CustomAgentEnvironmentVariable {
  name: string;
  value: string;
}

export interface CustomAgent {
  args: string[];
  autoAuthenticate: boolean;
  command: string;
  createdAt: string;
  environment: CustomAgentEnvironmentVariable[];
  id: CustomAgentRuntime;
  label: string;
  needAuth: boolean;
  updatedAt: string;
}

export interface CreateCustomAgentInput {
  args?: string[];
  autoAuthenticate?: boolean;
  command: string;
  environment?: CustomAgentEnvironmentVariable[];
  label: string;
  needAuth?: boolean;
}

export interface UpdateCustomAgentInput extends Partial<CreateCustomAgentInput> {
  id: CustomAgentRuntime;
}

export interface DeleteCustomAgentImpact {
  chatCount: number;
}

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
  explicit?: boolean;
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
    description: "Cline CLI through its ACP server.",
    id: "cline",
    label: "Cline",
  },
  {
    description: "Claude Code runtime through the Claude Agent SDK.",
    id: "claude",
    label: "Claude Code",
  },
  {
    description: "Codex runtime through the Codex app server.",
    id: "codex",
    label: "Codex",
  },
];

const builtinAgentRuntime = arkType(
  "'codex' | 'kimi' | 'opencode' | 'qoder' | 'copilot' | 'gemini' | 'cline' | 'claude'",
);

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return isBuiltinAgentRuntime(value) || isCustomAgentRuntime(value);
}

export function isBuiltinAgentRuntime(
  value: unknown,
): value is BuiltinAgentRuntime {
  return !(builtinAgentRuntime(value) instanceof arkType.errors);
}

export function isCustomAgentRuntime(
  value: unknown,
): value is CustomAgentRuntime {
  return (
    typeof value === "string" &&
    value.startsWith("custom:") &&
    value.length > "custom:".length
  );
}

export function getEnabledAgentOptions(
  settings: AgentSettings,
  availableAgents: AgentOption[] = AGENT_OPTIONS,
): AgentOption[] {
  const enabled = new Set(settings.enabledRuntimes);
  return availableAgents.filter((agent) => enabled.has(agent.id));
}

export function resolveEnabledAgentRuntime(
  settings: AgentSettings,
  runtime?: AgentRuntime,
  availableAgents: AgentOption[] = AGENT_OPTIONS,
): AgentRuntime {
  const available = new Set(availableAgents.map((agent) => agent.id));
  const enabledRuntimes = settings.enabledRuntimes.filter((enabledRuntime) =>
    available.has(enabledRuntime),
  );

  if (is.nonEmptyString(runtime) && enabledRuntimes.includes(runtime)) {
    return runtime;
  }

  if (
    is.nonEmptyString(settings.lastRuntime) &&
    enabledRuntimes.includes(settings.lastRuntime)
  ) {
    return settings.lastRuntime;
  }

  const resolvedRuntime = enabledRuntimes[0] ?? settings.enabledRuntimes[0];
  if (resolvedRuntime === undefined) {
    throw new Error("No enabled agent runtime is available.");
  }
  return resolvedRuntime;
}

export function sanitizeAgentRuntimePreference(
  value: unknown,
): AgentRuntimePreference {
  if (value === null || typeof value !== "object") return {};
  const input = value as Partial<AgentRuntimePreference>;
  const preference: AgentRuntimePreference = {};
  const model = sanitizePreferenceValue(input.model);
  const reasoningEffort = sanitizePreferenceValue(input.reasoningEffort);
  const mode = sanitizePreferenceValue(input.mode);
  const permissionMode = sanitizePreferenceValue(input.permissionMode);

  if (model !== undefined) preference.model = model;
  if (reasoningEffort !== undefined)
    preference.reasoningEffort = reasoningEffort;
  if (mode !== undefined) preference.mode = mode;
  if (permissionMode !== undefined) preference.permissionMode = permissionMode;
  if (input.explicit === true && Object.keys(preference).length > 0) {
    preference.explicit = true;
  }

  return preference;
}

export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const settings =
    value !== null && typeof value === "object"
      ? (value as Partial<AgentSettings>)
      : {};
  const legacySettings =
    value !== null && typeof value === "object"
      ? (value as Partial<{ defaultRuntime: unknown }>)
      : {};
  const parsedLastRuntime = parseAgentRuntime(settings.lastRuntime);
  const parsedLegacyDefault = parseAgentRuntime(legacySettings.defaultRuntime);
  const fallbackRuntime = parsedLastRuntime ?? parsedLegacyDefault;
  const enabledRuntimes = sanitizeEnabledRuntimes(
    settings.enabledRuntimes,
    fallbackRuntime,
  );
  const lastRuntime =
    fallbackRuntime !== undefined && enabledRuntimes.includes(fallbackRuntime)
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
  const runtimePreferences = { ...settings.runtimePreferences };
  if (preference) {
    runtimePreferences[runtime] = {
      ...preference,
      explicit: true,
    };
  } else {
    delete runtimePreferences[runtime];
  }

  return sanitizeAgentSettings({
    ...settings,
    lastRuntime: runtime,
    runtimePreferences,
  });
}

function sanitizeEnabledRuntimes(
  value: unknown,
  fallbackRuntime?: AgentRuntime,
): AgentRuntime[] {
  if (!Array.isArray(value)) {
    return AGENT_OPTIONS.map((agent) => agent.id);
  }

  const parsedRuntimes = new Set<AgentRuntime>();
  for (const item of value) {
    const parsed = parseAgentRuntime(item);
    if (parsed !== undefined) {
      parsedRuntimes.add(parsed);
    }
  }

  const enabledRuntimes = [
    ...AGENT_OPTIONS.flatMap((agent) =>
      parsedRuntimes.has(agent.id) ? [agent.id] : [],
    ),
    ...Array.from(parsedRuntimes).filter(isCustomAgentRuntime),
  ];

  if (enabledRuntimes.length > 0) return enabledRuntimes;
  return fallbackRuntime === undefined ? [] : [fallbackRuntime];
}

function sanitizeRuntimePreferences(
  value: unknown,
): AgentSettings["runtimePreferences"] {
  if (value === null || typeof value !== "object") return {};
  const input = value as Partial<
    Record<AgentRuntime, Partial<AgentRuntimePreference>>
  >;
  const preferences: AgentSettings["runtimePreferences"] = {};

  for (const [runtime, rawPreference] of Object.entries(input)) {
    if (!isAgentRuntime(runtime)) continue;
    const preference = sanitizeAgentRuntimePreference(rawPreference);
    if (preference.explicit === true) {
      preferences[runtime] = preference;
    }
  }

  return preferences;
}

function sanitizePreferenceValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseAgentRuntime(value: unknown): AgentRuntime | undefined {
  if (isCustomAgentRuntime(value)) return value;
  const parsed = builtinAgentRuntime(value);
  return parsed instanceof arkType.errors ? undefined : parsed;
}
