import type { Icon } from "@phosphor-icons/react";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";

/**
 * localStorage key for the mobile theme preference. Deliberately namespaced to
 * the mobile client so it can never collide with — or write back to — the
 * desktop renderer's own settings storage (KIT-144: mobile settings must not
 * affect desktop configuration).
 */
export const themeStorageKey = "angel-engine-mobile.theme";

export type ThemeMode = "system" | "light" | "dark";

export const themeModeOptions: Array<{
  value: ThemeMode;
  label: string;
  icon: Icon;
}> = [
  { value: "system", label: "System", icon: Desktop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];
