import { useCallback, useEffect, useState } from "react";

import { sanitizeAgentSettings, type AgentSettings } from "@/shared/agents";

const STORAGE_KEY = "angel-engine.agent-settings.v1";

export function useAgentSettings() {
  const [settings, setSettings] = useState<AgentSettings>(() =>
    readAgentSettings(),
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback(
    (updater: (settings: AgentSettings) => AgentSettings) => {
      setSettings((current) => sanitizeAgentSettings(updater(current)));
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
