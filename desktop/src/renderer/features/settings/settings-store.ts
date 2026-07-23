import type {
  AgentRuntime,
  AgentSettings,
  CreateCustomAgentInput,
  CustomAgent,
  UpdateCustomAgentInput,
} from "@angel-engine/daemon-api/agents";

import type { SupportedLanguage } from "@shared/i18n/resources";
import type { DesktopThemeMode } from "@/platform/theme";
import { sanitizeAgentSettings } from "@angel-engine/daemon-api/agents";
import { normalizeSupportedLanguage } from "@shared/i18n/resources";
import { create } from "zustand";
import { invalidateAgentCatalog } from "@/features/agents/agent-catalog-resource";
import { getApiClient } from "@/platform/api-client";
import { readDesktopThemeMode, setDesktopThemeMode } from "@/platform/theme";

const agentSettingsStorageKey = "angel-engine.agent-settings.v1";
const languageStorageKey = "angel-engine.language";
const settingsBroadcastChannel = "angel-engine.settings.v1";
const senderId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
const sendWithModEnterStorageKey = "angel-engine.send-with-mod-enter";
const worktreeDirtyPromptStorageKey =
  "angel-engine.worktree-dirty-prompt-enabled";

interface SettingsBroadcastMessage {
  agentSettings: AgentSettings;
  language: SupportedLanguage;
  refreshAgentOptions?: boolean;
  sendWithModEnter: boolean;
  senderId: string;
  themeMode: DesktopThemeMode;
  worktreeDirtyPromptEnabled: boolean;
}

interface SettingsState {
  agentSettings: AgentSettings;
  createCustomAgent: (input: CreateCustomAgentInput) => Promise<CustomAgent>;
  deleteCustomAgent: (runtime: AgentRuntime) => Promise<void>;
  deleteCustomAgentImpact: (
    runtime: AgentRuntime,
  ) => Promise<{ chatCount: number }>;
  language: SupportedLanguage;
  sendWithModEnter: boolean;
  setAgentEnabled: (runtime: AgentRuntime, enabled: boolean) => void;
  setAgentSettings: (
    updater: (settings: AgentSettings) => AgentSettings,
  ) => void;
  setLanguage: (language: SupportedLanguage) => void;
  setSendWithModEnter: (enabled: boolean) => void;
  setThemeMode: (themeMode: DesktopThemeMode) => void;
  setWorktreeDirtyPromptEnabled: (enabled: boolean) => void;
  themeMode: DesktopThemeMode;
  updateCustomAgent: (input: UpdateCustomAgentInput) => Promise<CustomAgent>;
  worktreeDirtyPromptEnabled: boolean;
}

const broadcastChannel = createBroadcastChannel();

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  agentSettings: readAgentSettings(),
  createCustomAgent: async (input) => {
    const agent = await getApiClient().agents.createCustom(input);
    updateSettingsState(
      set,
      get,
      (current) => ({
        agentSettings: sanitizeAgentSettings({
          ...current.agentSettings,
          agentOrder: [...current.agentSettings.agentOrder, agent.id],
          enabledRuntimes: [...current.agentSettings.enabledRuntimes, agent.id],
          lastRuntime: agent.id,
        }),
      }),
      { refreshAgentOptions: true },
    );
    invalidateAgentCatalog();
    return agent;
  },
  deleteCustomAgent: async (runtime) => {
    await getApiClient().agents.deleteCustom(runtime);
    updateSettingsState(
      set,
      get,
      (current) => ({
        agentSettings: sanitizeAgentSettings({
          ...current.agentSettings,
          agentOrder: current.agentSettings.agentOrder.filter(
            (item) => item !== runtime,
          ),
          enabledRuntimes: current.agentSettings.enabledRuntimes.filter(
            (item) => item !== runtime,
          ),
          lastRuntime:
            current.agentSettings.lastRuntime === runtime
              ? undefined
              : current.agentSettings.lastRuntime,
          runtimePreferences: Object.fromEntries(
            Object.entries(current.agentSettings.runtimePreferences).filter(
              ([key]) => key !== runtime,
            ),
          ),
        }),
      }),
      { refreshAgentOptions: true },
    );
    invalidateAgentCatalog();
  },
  deleteCustomAgentImpact: async (runtime) =>
    getApiClient().agents.deleteCustomImpact(runtime),
  language: readLanguage(),
  sendWithModEnter: readSendWithModEnter(),
  setAgentEnabled: (runtime, enabled) => {
    updateSettingsState(set, get, (current) => {
      const enabledRuntimes = new Set(current.agentSettings.enabledRuntimes);
      if (enabled) {
        enabledRuntimes.add(runtime);
      } else {
        enabledRuntimes.delete(runtime);
      }

      return {
        agentSettings: sanitizeAgentSettings({
          ...current.agentSettings,
          enabledRuntimes: [...enabledRuntimes],
        }),
      };
    });
  },
  setAgentSettings: (updater) => {
    updateSettingsState(set, get, (current) => ({
      agentSettings: sanitizeAgentSettings(updater(current.agentSettings)),
    }));
  },
  setLanguage: (language) => {
    updateSettingsState(set, get, (current) => {
      const normalizedLanguage = normalizeSupportedLanguage(language);
      return current.language === normalizedLanguage
        ? {}
        : { language: normalizedLanguage };
    });
  },
  setSendWithModEnter: (enabled) => {
    updateSettingsState(set, get, (current) =>
      current.sendWithModEnter === enabled ? {} : { sendWithModEnter: enabled },
    );
  },
  setThemeMode: (themeMode) => {
    updateSettingsState(set, get, (current) =>
      current.themeMode === themeMode ? {} : { themeMode },
    );
  },
  setWorktreeDirtyPromptEnabled: (enabled) => {
    updateSettingsState(set, get, (current) =>
      current.worktreeDirtyPromptEnabled === enabled
        ? {}
        : { worktreeDirtyPromptEnabled: enabled },
    );
  },
  themeMode: readDesktopThemeMode(),
  updateCustomAgent: async (input) => {
    const agent = await getApiClient().agents.updateCustom(input);
    invalidateAgentCatalog();
    broadcastChannel?.postMessage(
      settingsBroadcastMessage(get(), { refreshAgentOptions: true }),
    );
    return agent;
  },
  worktreeDirtyPromptEnabled: readWorktreeDirtyPromptEnabled(),
}));

broadcastChannel?.addEventListener("message", (event) => {
  const message = readBroadcastMessage(event.data);
  if (!message || message.senderId === senderId) return;

  applySettingsSideEffects(message);
  useSettingsStore.setState({
    agentSettings: message.agentSettings,
    language: message.language,
    sendWithModEnter: message.sendWithModEnter,
    themeMode: message.themeMode,
    worktreeDirtyPromptEnabled: message.worktreeDirtyPromptEnabled,
  });
  if (message.refreshAgentOptions === true) {
    invalidateAgentCatalog();
  }
});

interface UpdateSettingsStateOptions {
  refreshAgentOptions?: boolean;
}

function updateSettingsState(
  set: (
    partial:
      | Partial<SettingsState>
      | ((state: SettingsState) => Partial<SettingsState>),
  ) => void,
  get: () => SettingsState,
  updater: (state: SettingsState) => Partial<SettingsState>,
  options: UpdateSettingsStateOptions = {},
) {
  const nextPartial = updater(get());
  if (Object.keys(nextPartial).length === 0) return;

  set(nextPartial);
  const nextState = get();
  const message = settingsBroadcastMessage(nextState, options);
  applySettingsSideEffects(message);
  broadcastChannel?.postMessage(message);
}

function settingsBroadcastMessage(
  state: Pick<
    SettingsState,
    | "agentSettings"
    | "language"
    | "sendWithModEnter"
    | "themeMode"
    | "worktreeDirtyPromptEnabled"
  >,
  options: UpdateSettingsStateOptions = {},
): SettingsBroadcastMessage {
  return {
    agentSettings: state.agentSettings,
    language: state.language,
    refreshAgentOptions: options.refreshAgentOptions,
    sendWithModEnter: state.sendWithModEnter,
    senderId,
    themeMode: state.themeMode,
    worktreeDirtyPromptEnabled: state.worktreeDirtyPromptEnabled,
  };
}

function applySettingsSideEffects(message: SettingsBroadcastMessage) {
  writeAgentSettings(message.agentSettings);
  writeLanguage(message.language);
  writeSendWithModEnter(message.sendWithModEnter);
  writeWorktreeDirtyPromptEnabled(message.worktreeDirtyPromptEnabled);
  setDesktopThemeMode(message.themeMode);
}

function readBroadcastMessage(value: unknown): SettingsBroadcastMessage | null {
  if (value === null || typeof value !== "object") return null;
  const input = value as Partial<SettingsBroadcastMessage>;
  if (typeof input.senderId !== "string") return null;

  return {
    agentSettings: sanitizeAgentSettings(input.agentSettings),
    language: normalizeSupportedLanguage(input.language),
    refreshAgentOptions: input.refreshAgentOptions === true,
    sendWithModEnter: sanitizeSendWithModEnter(input.sendWithModEnter),
    senderId: input.senderId,
    themeMode: sanitizeThemeMode(input.themeMode),
    worktreeDirtyPromptEnabled: sanitizeWorktreeDirtyPromptEnabled(
      input.worktreeDirtyPromptEnabled,
    ),
  };
}

function readAgentSettings() {
  try {
    const raw = window.localStorage.getItem(agentSettingsStorageKey);
    const settings = sanitizeAgentSettings(
      raw !== null ? JSON.parse(raw) : undefined,
    );
    writeAgentSettings(settings);
    return settings;
  } catch {
    const settings = sanitizeAgentSettings(undefined);
    writeAgentSettings(settings);
    return settings;
  }
}

function writeAgentSettings(settings: AgentSettings) {
  window.localStorage.setItem(
    agentSettingsStorageKey,
    JSON.stringify(settings),
  );
}

function readLanguage() {
  try {
    return normalizeSupportedLanguage(
      window.localStorage.getItem(languageStorageKey) ??
        window.navigator.language,
    );
  } catch {
    return normalizeSupportedLanguage(window.navigator.language);
  }
}

function writeLanguage(language: SupportedLanguage) {
  window.localStorage.setItem(languageStorageKey, language);
}

function readSendWithModEnter() {
  try {
    return sanitizeSendWithModEnter(
      window.localStorage.getItem(sendWithModEnterStorageKey),
    );
  } catch {
    return false;
  }
}

function writeSendWithModEnter(enabled: boolean) {
  window.localStorage.setItem(
    sendWithModEnterStorageKey,
    enabled ? "true" : "false",
  );
}

function sanitizeSendWithModEnter(value: unknown) {
  return value === true || value === "true";
}

function readWorktreeDirtyPromptEnabled() {
  try {
    return sanitizeWorktreeDirtyPromptEnabled(
      window.localStorage.getItem(worktreeDirtyPromptStorageKey),
    );
  } catch {
    return true;
  }
}

function writeWorktreeDirtyPromptEnabled(enabled: boolean) {
  window.localStorage.setItem(
    worktreeDirtyPromptStorageKey,
    enabled ? "true" : "false",
  );
}

function sanitizeWorktreeDirtyPromptEnabled(value: unknown) {
  if (value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  return true;
}

function sanitizeThemeMode(value: unknown): DesktopThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

function createBroadcastChannel() {
  try {
    return new BroadcastChannel(settingsBroadcastChannel);
  } catch {
    return null;
  }
}
