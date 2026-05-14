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
const trafficLightPosition = { x: 16, y: 18 };

let didRegisterIpc = false;

export function desktopWindowChromeOptions(): BrowserWindowConstructorOptions {
  if (!isMacOS) {
    return {};
  }

  return {
    titleBarStyle: "hidden",
    trafficLightPosition,
    transparent: true,
  };
}

export function configureDesktopWindowAppearance(window: BrowserWindow) {
  if (isMacOS) {
    window.setWindowButtonPosition(trafficLightPosition);
  }
}

export function registerDesktopWindowAppearanceIpc() {
  if (didRegisterIpc) return;
  didRegisterIpc = true;

  ipcMain.on(DESKTOP_THEME_SET_CHANNEL, (_event, input: unknown) => {
    const mode = readThemeMode(input);
    if (!mode) return;

    nativeTheme.themeSource = mode;
  });
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
