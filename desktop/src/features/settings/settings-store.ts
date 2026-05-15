import { create } from "zustand";

import {
  sanitizeAgentSettings,
  type AgentRuntime,
  type AgentSettings,
} from "@/shared/agents";
import {
  readDesktopThemeMode,
  setDesktopThemeMode,
  type DesktopThemeMode,
} from "@/platform/theme";
import {
  normalizeSupportedLanguage,
  type SupportedLanguage,
} from "@/i18n/resources";

const agentSettingsStorageKey = "angel-engine.agent-settings.v1";
const languageStorageKey = "angel-engine.language";
const settingsBroadcastChannel = "angel-engine.settings.v1";
const senderId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());

type SettingsBroadcastMessage = {
  agentSettings: AgentSettings;
  language: SupportedLanguage;
  senderId: string;
  themeMode: DesktopThemeMode;
};

type SettingsState = {
  agentSettings: AgentSettings;
  language: SupportedLanguage;
  setAgentEnabled: (runtime: AgentRuntime, enabled: boolean) => void;
  setAgentSettings: (
    updater: (settings: AgentSettings) => AgentSettings,
  ) => void;
  setDefaultAgent: (runtime: AgentRuntime) => void;
  setLanguage: (language: SupportedLanguage) => void;
  setThemeMode: (themeMode: DesktopThemeMode) => void;
  themeMode: DesktopThemeMode;
};

const broadcastChannel = createBroadcastChannel();

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  agentSettings: readAgentSettings(),
  language: readLanguage(),
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
  setDefaultAgent: (runtime) => {
    updateSettingsState(set, get, (current) => {
      if (!current.agentSettings.enabledRuntimes.includes(runtime)) {
        return {};
      }

      return {
        agentSettings: sanitizeAgentSettings({
          ...current.agentSettings,
          defaultRuntime: runtime,
        }),
      };
    });
  },
  setLanguage: (language) => {
    updateSettingsState(set, get, (current) => {
      const normalizedLanguage = normalizeSupportedLanguage(language);
      return current.language === normalizedLanguage
        ? {}
        : { language: normalizedLanguage };
    });
  },
  setThemeMode: (themeMode) => {
    updateSettingsState(set, get, (current) =>
      current.themeMode === themeMode ? {} : { themeMode },
    );
  },
  themeMode: readDesktopThemeMode(),
}));

broadcastChannel?.addEventListener("message", (event) => {
  const message = readBroadcastMessage(event.data);
  if (!message || message.senderId === senderId) return;

  applySettingsSideEffects(message);
  useSettingsStore.setState({
    agentSettings: message.agentSettings,
    language: message.language,
    themeMode: message.themeMode,
  });
});

function updateSettingsState(
  set: (
    partial:
      | Partial<SettingsState>
      | ((state: SettingsState) => Partial<SettingsState>),
  ) => void,
  get: () => SettingsState,
  updater: (state: SettingsState) => Partial<SettingsState>,
) {
  const nextPartial = updater(get());
  if (Object.keys(nextPartial).length === 0) return;

  set(nextPartial);
  const nextState = get();
  const message = settingsBroadcastMessage(nextState);
  applySettingsSideEffects(message);
  broadcastChannel?.postMessage(message);
}

function settingsBroadcastMessage(
  state: Pick<SettingsState, "agentSettings" | "language" | "themeMode">,
): SettingsBroadcastMessage {
  return {
    agentSettings: state.agentSettings,
    language: state.language,
    senderId,
    themeMode: state.themeMode,
  };
}

function applySettingsSideEffects(message: SettingsBroadcastMessage) {
  writeAgentSettings(message.agentSettings);
  writeLanguage(message.language);
  setDesktopThemeMode(message.themeMode);
}

function readBroadcastMessage(value: unknown): SettingsBroadcastMessage | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<SettingsBroadcastMessage>;
  if (typeof input.senderId !== "string") return null;

  return {
    agentSettings: sanitizeAgentSettings(input.agentSettings),
    language: normalizeSupportedLanguage(input.language),
    senderId: input.senderId,
    themeMode: sanitizeThemeMode(input.themeMode),
  };
}

function readAgentSettings() {
  try {
    const raw = window.localStorage.getItem(agentSettingsStorageKey);
    return sanitizeAgentSettings(raw ? JSON.parse(raw) : undefined);
  } catch {
    return sanitizeAgentSettings(undefined);
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
