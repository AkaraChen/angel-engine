import {
  BrowserWindow,
  ipcMain,
  nativeTheme,
  type BrowserWindowConstructorOptions,
} from "electron";

import {
  DESKTOP_THEME_SET_CHANNEL,
  type DesktopThemeMode,
} from "../shared/desktop-window";

const isMacOS = process.platform === "darwin";
const transparentWindowBackground = "#00000000";
const darkWindowBackground = "#292a2e";
const trafficLightPosition = { x: 16, y: 18 };

const trackedWindows = new Set<BrowserWindow>();
let didRegisterIpc = false;

export function desktopWindowChromeOptions(): BrowserWindowConstructorOptions {
  if (!isMacOS) {
    return {};
  }

  return {
    backgroundColor: transparentWindowBackground,
    titleBarStyle: "hidden",
    trafficLightPosition,
    transparent: true,
    vibrancy: "under-window" as const,
    visualEffectState: "active" as const,
  };
}

export function configureDesktopWindowAppearance(window: BrowserWindow) {
  trackedWindows.add(window);
  applyDesktopWindowAppearance(window, nativeTheme.shouldUseDarkColors);

  window.on("closed", () => {
    trackedWindows.delete(window);
  });
}

export function registerDesktopWindowAppearanceIpc() {
  if (didRegisterIpc) return;
  didRegisterIpc = true;

  ipcMain.on(DESKTOP_THEME_SET_CHANNEL, (_event, input: unknown) => {
    const mode = readThemeMode(input);
    if (!mode) return;

    nativeTheme.themeSource = mode;
    applyDesktopWindowAppearanceToAll();
  });

  nativeTheme.on("updated", () => {
    applyDesktopWindowAppearanceToAll();
  });
}

function applyDesktopWindowAppearanceToAll() {
  const isDark = nativeTheme.shouldUseDarkColors;
  for (const window of trackedWindows) {
    applyDesktopWindowAppearance(window, isDark);
  }
}

function applyDesktopWindowAppearance(window: BrowserWindow, isDark: boolean) {
  if (window.isDestroyed()) return;

  if (isMacOS) {
    window.setBackgroundColor(transparentWindowBackground);
    window.setVibrancy("under-window");
    window.setWindowButtonPosition(trafficLightPosition);
    return;
  }

  window.setBackgroundColor(isDark ? darkWindowBackground : "#ffffff");
}

function readThemeMode(input: unknown): DesktopThemeMode | null {
  if (!isObject(input)) return null;

  switch (input.mode) {
    case "light":
    case "dark":
    case "system":
      return input.mode;
    default:
      return null;
  }
}

function isObject(value: unknown): value is { mode?: unknown } {
  return typeof value === "object" && value !== null;
}
