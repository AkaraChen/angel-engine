import type { BrowserWindowConstructorOptions } from "electron";

import type { DesktopThemeMode } from "../../shared/desktop-window";
import { type } from "arktype";
import { BrowserWindow, ipcMain, nativeTheme } from "electron";
import {
  DESKTOP_INSTALL_UPDATE_CHANNEL,
  DESKTOP_THEME_SET_CHANNEL,
} from "../../shared/desktop-window";
import { installDownloadedUpdate } from "../updater";

const trafficLightPosition = { x: 16, y: 18 };
const themeModeInput = type({
  "+": "ignore",
  "mode?": "'light' | 'dark' | 'system' | undefined",
});

let didRegisterIpc = false;

export function desktopWindowChromeOptions(): BrowserWindowConstructorOptions {
  return desktopWindowChromeOptionsForPlatform(process.platform);
}

export function desktopWindowChromeOptionsForPlatform(
  platform: NodeJS.Platform,
): BrowserWindowConstructorOptions {
  if (platform === "linux") {
    return { frame: true };
  }

  if (!usesCustomWindowChrome(platform)) {
    return {};
  }

  return {
    titleBarStyle: "hidden",
    trafficLightPosition,
    transparent: true,
  };
}

export function configureDesktopWindowAppearance(window: BrowserWindow) {
  if (usesCustomWindowChrome(process.platform)) {
    window.setWindowButtonPosition(trafficLightPosition);
  }
}

export function usesCustomWindowChrome(platform: NodeJS.Platform) {
  return platform === "darwin";
}

export function registerDesktopWindowAppearanceIpc() {
  if (didRegisterIpc) return;
  didRegisterIpc = true;

  ipcMain.on(DESKTOP_THEME_SET_CHANNEL, (_event, input: unknown) => {
    const mode = readThemeMode(input);
    if (!mode) return;

    nativeTheme.themeSource = mode;
  });

  ipcMain.handle(DESKTOP_INSTALL_UPDATE_CHANNEL, () => {
    installDownloadedUpdate();
  });
}

function readThemeMode(input: unknown): DesktopThemeMode | null {
  const value = themeModeInput(input);
  if (value instanceof type.errors) return null;
  return value.mode ?? null;
}
