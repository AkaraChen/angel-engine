import type { DesktopThemeMode } from "@shared/desktop-window";

const systemDarkQuery = "(prefers-color-scheme: dark)";
const themeModeStorageKey = "angel-engine.theme-mode.v1";

export type { DesktopThemeMode } from "@shared/desktop-window";

export function applyDesktopPlatform() {
  document.documentElement.dataset.platform =
    window.desktopEnvironment.platform;
}

export function syncDesktopColorScheme() {
  const media = window.matchMedia(systemDarkQuery);

  applyThemeMode(readDesktopThemeMode(), media);

  const handleSystemChange = () => {
    applyThemeMode(readDesktopThemeMode(), media);
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === themeModeStorageKey) {
      applyThemeMode(readDesktopThemeMode(), media);
    }
  };

  media.addEventListener("change", handleSystemChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    media.removeEventListener("change", handleSystemChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function readDesktopThemeMode(): DesktopThemeMode {
  try {
    return sanitizeDesktopThemeMode(
      window.localStorage.getItem(themeModeStorageKey),
    );
  } catch {
    return "system";
  }
}

export function setDesktopThemeMode(mode: DesktopThemeMode) {
  window.localStorage.setItem(themeModeStorageKey, mode);
  applyThemeMode(mode, window.matchMedia(systemDarkQuery));
}

function sanitizeDesktopThemeMode(value: unknown): DesktopThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

function applyThemeMode(mode: DesktopThemeMode, media: MediaQueryList) {
  const isDark = mode === "system" ? media.matches : mode === "dark";
  applyColorScheme(isDark);
  window.desktopWindow.setTheme({ mode });
}

function applyColorScheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}
