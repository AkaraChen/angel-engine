import type { BrowserWindow } from "electron";

import { createDesktopWindow } from "./factory";

let mainWindow: BrowserWindow | null = null;

export function createMainWindow() {
  const window = createDesktopWindow({
    options: {
      minHeight: 640,
      minWidth: 960,
    },
    role: "main",
  });

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

export function getMainWindow() {
  if (mainWindow?.isDestroyed()) mainWindow = null;
  return mainWindow;
}

export function ensureMainWindow() {
  return getMainWindow() ?? createMainWindow();
}
