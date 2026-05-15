import type { DesktopThemeMode } from "@/platform/theme";
import { useSettingsStore } from "@/features/settings/settings-store";

export function useThemeSettings() {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const setThemeMode = useSettingsStore((state) => state.setThemeMode);

  return [themeMode, setThemeMode] as readonly [
    DesktopThemeMode,
    (mode: DesktopThemeMode) => void,
  ];
}
