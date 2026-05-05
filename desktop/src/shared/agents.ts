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
  models: Record<AgentRuntime, string>;
  modes: Record<AgentRuntime, string>;
  reasoningEfforts: Record<AgentRuntime, string>;
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

export const DEFAULT_AGENT_RUNTIME: AgentRuntime = "codex";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  defaultRuntime: DEFAULT_AGENT_RUNTIME,
  models: {
    codex: "default",
    kimi: "default",
    opencode: "default",
  },
  modes: {
    codex: "default",
    kimi: "default",
    opencode: "default",
  },
  reasoningEfforts: {
    codex: "high",
    kimi: "default",
    opencode: "default",
  },
};

const AGENT_BY_RUNTIME = new Map(
  AGENT_OPTIONS.map((agent) => [agent.id, agent]),
);

const REASONING_EFFORTS: Record<AgentRuntime, AgentValueOption[]> = {
  codex: [
    { label: "None", value: "none" },
    { label: "Minimal", value: "minimal" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
    { label: "XHigh", value: "xhigh" },
  ],
  kimi: [{ label: "Default", value: "default" }],
  opencode: [{ label: "Default", value: "default" }],
};

const AGENT_MODES: Record<AgentRuntime, AgentValueOption[]> = {
  codex: [
    { label: "Default", value: "default" },
    {
      description: "Start the next Codex turn in planning mode.",
      label: "Plan",
      value: "plan",
    },
  ],
  kimi: [{ label: "Default", value: "default" }],
  opencode: [{ label: "Default", value: "default" }],
};

export function getAgentOption(runtime: string | null | undefined) {
  return AGENT_BY_RUNTIME.get(normalizeAgentRuntime(runtime));
}

export function getAgentReasoningEfforts(runtime: string | null | undefined) {
  return REASONING_EFFORTS[normalizeAgentRuntime(runtime)];
}

export function getAgentModes(runtime: string | null | undefined) {
  return AGENT_MODES[normalizeAgentRuntime(runtime)];
}

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

export function normalizeAgentReasoningEffort(
  runtime: string | null | undefined,
  effort: string | null | undefined,
) {
  const normalizedRuntime = normalizeAgentRuntime(runtime);
  return normalizeOptionValue(
    getAgentReasoningEfforts(normalizedRuntime),
    effort,
    DEFAULT_AGENT_SETTINGS.reasoningEfforts[normalizedRuntime],
  );
}

export function normalizeAgentMode(
  runtime: string | null | undefined,
  mode: string | null | undefined,
) {
  const normalizedRuntime = normalizeAgentRuntime(runtime);
  return normalizeOptionValue(
    getAgentModes(normalizedRuntime),
    mode,
    DEFAULT_AGENT_SETTINGS.modes[normalizedRuntime],
  );
}

export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const settings =
    value && typeof value === "object" ? (value as Partial<AgentSettings>) : {};
  const defaultRuntime = normalizeAgentRuntime(settings.defaultRuntime);
  const models = { ...DEFAULT_AGENT_SETTINGS.models };
  const reasoningEfforts = { ...DEFAULT_AGENT_SETTINGS.reasoningEfforts };
  const modes = { ...DEFAULT_AGENT_SETTINGS.modes };

  for (const agent of AGENT_OPTIONS) {
    models[agent.id] = normalizeAgentModel(settings.models?.[agent.id]);
    reasoningEfforts[agent.id] = normalizeAgentConfigValue(
      settings.reasoningEfforts?.[agent.id],
      DEFAULT_AGENT_SETTINGS.reasoningEfforts[agent.id],
    );
    modes[agent.id] = normalizeAgentConfigValue(
      settings.modes?.[agent.id],
      DEFAULT_AGENT_SETTINGS.modes[agent.id],
    );
  }

  return {
    defaultRuntime,
    models,
    modes,
    reasoningEfforts,
  };
}

export function normalizeAgentModel(model: string | null | undefined) {
  return normalizeAgentConfigValue(model);
}

export function normalizeAgentConfigValue(
  value: string | null | undefined,
  fallback = "default",
) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function selectedAgentConfigValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "default") return undefined;
  return trimmed;
}

function normalizeOptionValue(
  options: AgentValueOption[],
  value: string | null | undefined,
  fallback: string,
) {
  const trimmed = value?.trim();
  if (trimmed && options.some((option) => option.value === trimmed)) {
    return trimmed;
  }
  return fallback;
}
