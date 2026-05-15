import type { BrowserWindowConstructorOptions } from "electron";

import path from "node:path";
import { BrowserWindow, shell } from "electron";

import {
  configureDesktopWindowAppearance,
  desktopWindowChromeOptions,
} from "./appearance";
import { configureDesktopWindowNotifications } from "./notifications";
import { persistWindowBounds, savedWindowBounds } from "./state";

interface CreateDesktopWindowOptions {
  bounds?: Parameters<typeof savedWindowBounds>[0];
  hash?: string;
  options?: BrowserWindowConstructorOptions;
  stateFileName?: string;
}

export function createDesktopWindow({
  bounds,
  hash,
  options,
  stateFileName,
}: CreateDesktopWindowOptions = {}) {
  const rendererFilePath = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  const window = new BrowserWindow({
    ...desktopWindowChromeOptions(),
    ...savedWindowBounds(bounds),
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      ...options?.webPreferences,
    },
  });

  configureDesktopWindowAppearance(window);
  persistWindowBounds(window, stateFileName);
  configureExternalLinkHandling(window);
  configureDesktopWindowNotifications(window);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = hash
      ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#${hash.replace(/^#/, "")}`
      : MAIN_WINDOW_VITE_DEV_SERVER_URL;
    window.loadURL(url);
  } else if (hash) {
    window.loadFile(rendererFilePath, { hash });
  } else {
    window.loadFile(rendererFilePath);
  }

  return window;
}

function configureExternalLinkHandling(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}
