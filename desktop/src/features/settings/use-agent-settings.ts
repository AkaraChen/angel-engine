import { useCallback, useRef, useState } from "react";

import { sanitizeAgentSettings, type AgentSettings } from "@/shared/agents";

const STORAGE_KEY = "angel-engine.agent-settings.v1";

export function useAgentSettings() {
  const [settings, setSettings] = useState<AgentSettings>(() =>
    readAgentSettings(),
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback(
    (updater: (settings: AgentSettings) => AgentSettings) => {
      const nextSettings = sanitizeAgentSettings(updater(settingsRef.current));
      settingsRef.current = nextSettings;
      writeAgentSettings(nextSettings);
      setSettings(nextSettings);
    },
    [],
  );

  return [settings, updateSettings] as const;
}

function readAgentSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeAgentSettings(raw ? JSON.parse(raw) : undefined);
  } catch {
    return sanitizeAgentSettings(undefined);
  }
}

function writeAgentSettings(settings: AgentSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
