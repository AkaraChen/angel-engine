export interface DesktopTrayPreferences {
  enabled: boolean;
}

export const DEFAULT_TRAY_PREFERENCES: DesktopTrayPreferences = {
  enabled: true,
};

export function sanitizeTrayPreferences(
  value: unknown,
): DesktopTrayPreferences {
  if (value === null || typeof value !== "object") {
    return { ...DEFAULT_TRAY_PREFERENCES };
  }

  const input = value as Partial<DesktopTrayPreferences>;
  return {
    enabled: sanitizeTrayEnabled(input.enabled),
  };
}

export function sanitizeTrayEnabled(value: unknown): boolean {
  if (value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  return DEFAULT_TRAY_PREFERENCES.enabled;
}
