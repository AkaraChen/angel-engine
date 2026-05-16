import type { AgentRuntime, AgentSettings } from "@shared/agents";
import type { ChatRuntimeConfig } from "@shared/chat";

import type { Dispatch, SetStateAction } from "react";
import type { DraftAgentConfig } from "@/app/workspace/workspace-thread-types";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ensureConfigOption,
  normalizeConfigDisplayValue,
  resolveSavedConfigSelection,
  runtimeConfigOptionCount,
  runtimeConfigOptionsToAgentOptions,
  selectedConfigOverride,
  supportedConfigOverride,
} from "@/app/workspace/chat-runtime-options";
import { EMPTY_DRAFT_AGENT_CONFIG } from "@/app/workspace/workspace-thread-types";

type DraftRuntimeOptions = Array<{
  label: string;
  value: AgentRuntime;
}>;

interface UseDraftChatOptionsInput {
  activeRuntime: AgentRuntime;
  agentSettings: Pick<AgentSettings, "enabledRuntimes" | "runtimePreferences">;
  configLoading: boolean;
  draftAgentConfigs: Partial<Record<string, DraftAgentConfig>>;
  draftRuntimeKey?: string;
  runtimeConfig?: ChatRuntimeConfig;
  runtimeOptions: DraftRuntimeOptions;
  runtimePageKey: string;
  setDraftAgentConfigs: Dispatch<
    SetStateAction<Partial<Record<string, DraftAgentConfig>>>
  >;
  setDraftRuntimes: Dispatch<
    SetStateAction<Partial<Record<string, AgentRuntime>>>
  >;
}

export function useDraftChatOptions({
  activeRuntime,
  agentSettings,
  configLoading,
  draftAgentConfigs,
  draftRuntimeKey,
  runtimeConfig,
  runtimeOptions,
  runtimePageKey,
  setDraftAgentConfigs,
  setDraftRuntimes,
}: UseDraftChatOptionsInput) {
  const { t } = useTranslation();
  const draftAgentConfigKey = `${runtimePageKey}:${activeRuntime}`;
  const draftAgentConfig =
    draftAgentConfigs[draftAgentConfigKey] ?? EMPTY_DRAFT_AGENT_CONFIG;
  const runtimePreference = agentSettings.runtimePreferences[activeRuntime];
  const savedModelSelection = resolveSavedConfigSelection({
    canSet: runtimeConfig?.canSetModel,
    currentValue: runtimeConfig?.currentModel,
    options: runtimeConfig?.models,
    savedValue: runtimePreference?.model,
  });
  const savedReasoningSelection = resolveSavedConfigSelection({
    canSet: runtimeConfig?.canSetReasoningEffort,
    currentValue: runtimeConfig?.currentReasoningEffort,
    options: runtimeConfig?.reasoningEfforts,
    savedValue: runtimePreference?.reasoningEffort,
  });
  const savedModeSelection = resolveSavedConfigSelection({
    canSet: runtimeConfig?.canSetMode,
    currentValue:
      runtimeConfig?.agentState?.currentMode ?? runtimeConfig?.currentMode,
    options: runtimeConfig?.modes,
    savedValue: runtimePreference?.mode,
  });
  const savedPermissionModeSelection = resolveSavedConfigSelection({
    canSet: runtimeConfig?.canSetPermissionMode,
    currentValue:
      runtimeConfig?.agentState?.currentPermissionMode ??
      runtimeConfig?.currentPermissionMode,
    options: runtimeConfig?.permissionModes,
    savedValue: runtimePreference?.permissionMode,
  });
  const draftReasoningEffortOverride =
    draftAgentConfig.reasoningEffort === undefined
      ? undefined
      : supportedConfigOverride({
          canSet: runtimeConfig?.canSetReasoningEffort,
          options: runtimeConfig?.reasoningEfforts,
          value: draftAgentConfig.reasoningEffort,
        });
  const draftReasoningEffortDisplay =
    draftAgentConfig.reasoningEffort === undefined
      ? undefined
      : selectedConfigOverride(draftAgentConfig.reasoningEffort)
        ? draftReasoningEffortOverride
        : draftAgentConfig.reasoningEffort;
  const activeModel = normalizeConfigDisplayValue(
    draftAgentConfig.model ??
      savedModelSelection.displayValue ??
      runtimeConfig?.currentModel,
  );
  const activeReasoningEffort = normalizeConfigDisplayValue(
    draftReasoningEffortDisplay ??
      savedReasoningSelection.displayValue ??
      runtimeConfig?.currentReasoningEffort,
  );
  const activeMode = normalizeConfigDisplayValue(
    draftAgentConfig.mode ??
      savedModeSelection.displayValue ??
      runtimeConfig?.agentState?.currentMode ??
      runtimeConfig?.currentMode,
  );
  const activePermissionMode = normalizeConfigDisplayValue(
    draftAgentConfig.permissionMode ??
      savedPermissionModeSelection.displayValue ??
      runtimeConfig?.agentState?.currentPermissionMode ??
      runtimeConfig?.currentPermissionMode,
  );
  const modelOverride =
    draftAgentConfig.model === undefined
      ? savedModelSelection.overrideValue
      : selectedConfigOverride(draftAgentConfig.model);
  const reasoningEffortOverride =
    draftAgentConfig.reasoningEffort === undefined
      ? savedReasoningSelection.overrideValue
      : draftReasoningEffortOverride;
  const modeOverride =
    draftAgentConfig.mode === undefined
      ? savedModeSelection.overrideValue
      : selectedConfigOverride(draftAgentConfig.mode);
  const permissionModeOverride =
    draftAgentConfig.permissionMode === undefined
      ? savedPermissionModeSelection.overrideValue
      : selectedConfigOverride(draftAgentConfig.permissionMode);
  const modelOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.models,
      t("common.useDefault"),
    ),
    activeModel,
    t("common.useDefault"),
    t("common.default"),
  );
  const reasoningEffortOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.reasoningEfforts,
      t("common.useDefault"),
    ),
    activeReasoningEffort,
    t("common.useDefault"),
    t("common.default"),
  );
  const modeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.modes,
      t("common.useDefault"),
    ),
    activeMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const permissionModeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.permissionModes,
      t("common.useDefault"),
    ),
    activePermissionMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const modelOptionCount = runtimeConfigOptionCount(runtimeConfig?.models);
  const reasoningEffortOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.reasoningEfforts,
  );
  const modeOptionCount = runtimeConfigOptionCount(runtimeConfig?.modes);
  const permissionModeOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.permissionModes,
  );
  const canSetModel = runtimeConfig?.canSetModel ?? true;
  const canSetMode = runtimeConfig?.canSetMode ?? true;
  const canSetPermissionMode = runtimeConfig?.canSetPermissionMode ?? true;
  const canSetReasoningEffort = runtimeConfig?.canSetReasoningEffort ?? true;
  const setDraftAgentRuntime = useCallback(
    (runtime: AgentRuntime) => {
      if (!draftRuntimeKey) return;
      if (!agentSettings.enabledRuntimes.includes(runtime)) return;
      setDraftRuntimes((current) => ({
        ...current,
        [draftRuntimeKey]: runtime,
      }));
    },
    [agentSettings.enabledRuntimes, draftRuntimeKey, setDraftRuntimes],
  );
  const setDraftAgentConfigValue = useCallback(
    (field: keyof DraftAgentConfig, value: string) => {
      setDraftAgentConfigs((current) => ({
        ...current,
        [draftAgentConfigKey]: {
          ...current[draftAgentConfigKey],
          [field]: normalizeConfigDisplayValue(value),
        },
      }));
    },
    [draftAgentConfigKey, setDraftAgentConfigs],
  );
  const setAgentModel = useCallback(
    (model: string) => {
      setDraftAgentConfigValue("model", model);
    },
    [setDraftAgentConfigValue],
  );
  const setAgentReasoningEffort = useCallback(
    (effort: string) => {
      setDraftAgentConfigValue("reasoningEffort", effort);
    },
    [setDraftAgentConfigValue],
  );
  const setAgentMode = useCallback(
    (mode: string) => {
      setDraftAgentConfigValue("mode", mode);
    },
    [setDraftAgentConfigValue],
  );
  const setAgentPermissionMode = useCallback(
    (mode: string) => {
      setDraftAgentConfigValue("permissionMode", mode);
    },
    [setDraftAgentConfigValue],
  );
  const chatOptions = useMemo(
    () => ({
      canSetModel,
      canSetMode,
      canSetPermissionMode,
      canSetReasoningEffort,
      canSetRuntime: true,
      configLoading,
      model: activeModel,
      modelOptionCount,
      modelOptions,
      mode: activeMode,
      modeOptionCount,
      modeOptions,
      permissionMode: activePermissionMode,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffort: activeReasoningEffort,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtime: activeRuntime,
      runtimeOptions,
      setModel: setAgentModel,
      setMode: setAgentMode,
      setPermissionMode: setAgentPermissionMode,
      setReasoningEffort: setAgentReasoningEffort,
      setRuntime: setDraftAgentRuntime,
    }),
    [
      activeMode,
      activeModel,
      activePermissionMode,
      activeReasoningEffort,
      activeRuntime,
      canSetModel,
      canSetMode,
      canSetPermissionMode,
      canSetReasoningEffort,
      configLoading,
      modelOptionCount,
      modelOptions,
      modeOptionCount,
      modeOptions,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtimeOptions,
      setAgentModel,
      setAgentMode,
      setAgentPermissionMode,
      setAgentReasoningEffort,
      setDraftAgentRuntime,
    ],
  );

  return {
    chatOptions,
    draftAgentConfig,
    modeOverride,
    modelOverride,
    permissionModeOverride,
    reasoningEffortOverride,
    setAgentModel,
    setAgentReasoningEffort,
  };
}
