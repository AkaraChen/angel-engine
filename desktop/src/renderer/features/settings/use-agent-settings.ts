import type { AgentSettings } from "@shared/agents";
import { useSettingsStore } from "@/features/settings/settings-store";

export function useAgentSettings() {
  const agentSettings = useSettingsStore((state) => state.agentSettings);
  const setAgentSettings = useSettingsStore((state) => state.setAgentSettings);

  return [agentSettings, setAgentSettings] as readonly [
    AgentSettings,
    (updater: (settings: AgentSettings) => AgentSettings) => void,
  ];
}
