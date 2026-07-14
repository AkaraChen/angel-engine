import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { AGENT_OPTIONS, AGENT_SKILL_DIRECTORY_RULES } from "./agent-catalog";

export { AGENT_OPTIONS, AGENT_SKILL_DIRECTORY_RULES };

export type AgentRuntime =
  | CustomAgentRuntime
  | "codex"
  | "kimi"
  | "opencode"
  | "qoder"
  | "copilot"
  | "gemini"
  | "cline"
  | "pi"
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

export interface UpdateCustomAgentInput
  extends Partial<CreateCustomAgentInput> {
  id: CustomAgentRuntime;
}

export interface DeleteCustomAgentImpact {
  chatCount: number;
}

export interface AgentSkillsInput {
  projectPath?: string;
  runtime: string;
}

export const agentSkillsInputSchema = arkType({
  "+": "ignore",
  "projectPath?": "string > 0 | undefined",
  runtime: "string > 0",
});

const customAgentEnvironmentVariableSchema = arkType({
  name: "string",
  value: "string",
});
const stringListSchema = arkType("string").array();

export const createCustomAgentInputSchema = arkType({
  "+": "ignore",
  "args?": stringListSchema.or("undefined"),
  "autoAuthenticate?": "boolean | undefined",
  command: "string > 0",
  "environment?": customAgentEnvironmentVariableSchema.array().or("undefined"),
  label: "string > 0",
  "needAuth?": "boolean | undefined",
});

export const updateCustomAgentInputSchema = arkType({
  "+": "ignore",
  "args?": stringListSchema.or("undefined"),
  "autoAuthenticate?": "boolean | undefined",
  "command?": "string > 0 | undefined",
  "environment?": customAgentEnvironmentVariableSchema.array().or("undefined"),
  id: "string > 0",
  "label?": "string > 0 | undefined",
  "needAuth?": "boolean | undefined",
});

export interface AgentOption {
  description: string;
  id: AgentRuntime;
  label: string;
  skillDirectories?: AgentSkillDirectoryRules;
}

export interface AgentSkillDirectoryRules {
  globalDirs: string[];
  projectRelativeDirs: string[];
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
  agentOrder: AgentRuntime[];
  enabledRuntimes: AgentRuntime[];
  lastRuntime?: AgentRuntime;
  runtimePreferences: Partial<Record<AgentRuntime, AgentRuntimePreference>>;
}

const builtinAgentRuntime = arkType(
  "'codex' | 'kimi' | 'opencode' | 'qoder' | 'copilot' | 'gemini' | 'cline' | 'claude' | 'pi'",
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
  return sortAgentOptionsBySettings(
    settings,
    availableAgents.filter((agent) => enabled.has(agent.id)),
  );
}

export function sortAgentOptionsBySettings(
  settings: Pick<AgentSettings, "agentOrder">,
  agents: AgentOption[],
): AgentOption[] {
  const orderIndex = new Map(
    settings.agentOrder.map((runtime, index) => [runtime, index]),
  );

  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => {
      const leftOrder =
        orderIndex.get(left.agent.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder =
        orderIndex.get(right.agent.id) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ agent }) => agent);
}

export function rememberAgentOrder(
  settings: AgentSettings,
  orderedRuntimes: AgentRuntime[],
): AgentSettings {
  const orderedRuntimeSet = new Set(orderedRuntimes);

  return sanitizeAgentSettings({
    ...settings,
    agentOrder: [
      ...orderedRuntimes,
      ...settings.agentOrder.filter(
        (runtime) => !orderedRuntimeSet.has(runtime),
      ),
    ],
  });
}

export function moveAgentRuntimeOrder(
  runtimes: AgentRuntime[],
  runtime: AgentRuntime,
  targetIndex: number,
): AgentRuntime[] {
  const fromIndex = runtimes.indexOf(runtime);
  if (fromIndex < 0) return runtimes;

  const next = [...runtimes];
  const [item] = next.splice(fromIndex, 1);
  const adjustedTargetIndex =
    targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
  next.splice(Math.max(0, Math.min(adjustedTargetIndex, next.length)), 0, item);
  return next;
}

export function resolveEnabledAgentRuntime(
  settings: AgentSettings,
  runtime?: AgentRuntime,
  availableAgents: AgentOption[] = AGENT_OPTIONS,
): AgentRuntime {
  const enabledRuntimes = getEnabledAgentOptions(settings, availableAgents).map(
    (agent) => agent.id,
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

  const resolvedRuntime =
    enabledRuntimes[0] ?? orderedEnabledRuntimes(settings)[0];
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
  const runtimePreferences = sanitizeRuntimePreferences(
    settings.runtimePreferences,
  );
  const lastRuntime =
    fallbackRuntime !== undefined && enabledRuntimes.includes(fallbackRuntime)
      ? fallbackRuntime
      : enabledRuntimes[0];

  return {
    agentOrder: sanitizeAgentOrder({
      enabledRuntimes,
      fallbackRuntime,
      runtimePreferences,
      value: settings.agentOrder,
    }),
    enabledRuntimes,
    lastRuntime,
    runtimePreferences,
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

function sanitizeAgentOrder({
  enabledRuntimes,
  fallbackRuntime,
  runtimePreferences,
  value,
}: {
  enabledRuntimes: AgentRuntime[];
  fallbackRuntime?: AgentRuntime;
  runtimePreferences: AgentSettings["runtimePreferences"];
  value: unknown;
}): AgentRuntime[] {
  const parsedOrder = parseRuntimeList(value);
  const referencedCustomRuntimes = new Set(
    [
      ...enabledRuntimes,
      ...Object.keys(runtimePreferences).filter(isAgentRuntime),
      fallbackRuntime,
    ].filter(isCustomAgentRuntime),
  );

  if (parsedOrder.length === 0) {
    return [
      ...AGENT_OPTIONS.map((agent) => agent.id),
      ...referencedCustomRuntimes,
    ];
  }

  const ordered = [...parsedOrder];
  const orderedSet = new Set(ordered);

  for (const agent of AGENT_OPTIONS) {
    if (!orderedSet.has(agent.id)) {
      ordered.push(agent.id);
      orderedSet.add(agent.id);
    }
  }

  for (const runtime of referencedCustomRuntimes) {
    if (!orderedSet.has(runtime)) {
      ordered.push(runtime);
      orderedSet.add(runtime);
    }
  }

  return ordered;
}

function orderedEnabledRuntimes(settings: AgentSettings): AgentRuntime[] {
  const enabled = new Set(settings.enabledRuntimes);
  return settings.agentOrder.filter((runtime) => enabled.has(runtime));
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

function parseRuntimeList(value: unknown): AgentRuntime[] {
  if (!Array.isArray(value)) return [];

  const runtimes: AgentRuntime[] = [];
  const seen = new Set<AgentRuntime>();
  for (const item of value) {
    const runtime = parseAgentRuntime(item);
    if (runtime === undefined || seen.has(runtime)) continue;
    runtimes.push(runtime);
    seen.add(runtime);
  }

  return runtimes;
}

function parseAgentRuntime(value: unknown): AgentRuntime | undefined {
  if (isCustomAgentRuntime(value)) return value;
  const parsed = builtinAgentRuntime(value);
  return parsed instanceof arkType.errors ? undefined : parsed;
}
