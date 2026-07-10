import type { AgentRuntime, AgentRuntimePreference } from "@shared/agents";
import type { DraftAgentConfig } from "@/app/workspace/workspace-thread-types";

import { sanitizeAgentRuntimePreference } from "@shared/agents";
import {
  draftAgentConfigKey,
  workspaceRuntimePageKey,
} from "@/app/workspace/workspace-runtime-keys";

export function agentRuntimePreferenceFromExplicitOverrides(
  overrides: AgentRuntimePreference,
): AgentRuntimePreference | undefined {
  const preference = sanitizeAgentRuntimePreference(overrides);

  return Object.keys(preference).length > 0 ? preference : undefined;
}

export function carryDraftAgentConfigToChat(
  configs: Partial<Record<string, DraftAgentConfig>>,
  {
    config,
    runtime,
    targetChatId,
  }: {
    config?: DraftAgentConfig;
    runtime: AgentRuntime;
    targetChatId: string;
  },
): Partial<Record<string, DraftAgentConfig>> {
  if (config === undefined || Object.keys(config).length === 0) return configs;

  const targetKey = draftAgentConfigKey(
    workspaceRuntimePageKey({
      chatRuntime: runtime,
      selectedChatId: targetChatId,
      settingsActive: false,
    }),
    runtime,
  );
  if (configs[targetKey] === config) return configs;

  return {
    ...configs,
    [targetKey]: config,
  };
}

export function draftAgentConfigFromExplicitOverrides(
  overrides: DraftAgentConfig,
): DraftAgentConfig | undefined {
  const config: DraftAgentConfig = {};
  if (overrides.model !== undefined) config.model = overrides.model;
  if (overrides.mode !== undefined) config.mode = overrides.mode;
  if (overrides.permissionMode !== undefined) {
    config.permissionMode = overrides.permissionMode;
  }
  if (overrides.reasoningEffort !== undefined) {
    config.reasoningEffort = overrides.reasoningEffort;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

export function optionalString(value: string | null | undefined) {
  return value ?? undefined;
}

export function clearDraftAgentConfig(
  configs: Partial<Record<string, DraftAgentConfig>>,
  runtimePageKey: string,
  runtime: AgentRuntime,
): Partial<Record<string, DraftAgentConfig>> {
  const keyToClear = draftAgentConfigKey(runtimePageKey, runtime);
  if (configs[keyToClear] === undefined) return configs;

  const next = { ...configs };
  delete next[keyToClear];

  return next;
}
