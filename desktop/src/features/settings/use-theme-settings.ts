import { useCallback, useState } from "react";

import {
  readDesktopThemeMode,
  setDesktopThemeMode,
  type DesktopThemeMode,
} from "@/platform/theme";

export function useThemeSettings() {
  const [themeMode, setThemeModeState] = useState<DesktopThemeMode>(() =>
    readDesktopThemeMode(),
  );

  const setThemeMode = useCallback((mode: DesktopThemeMode) => {
    setDesktopThemeMode(mode);
    setThemeModeState(mode);
  }, []);

  return [themeMode, setThemeMode] as const;
}
