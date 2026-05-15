import type { BrowserWindow } from "electron";

import { createDesktopWindow } from "./factory";

const settingsWindowStateFileName = "settings-window-state.json";

let settingsWindow: BrowserWindow | null = null;
let settingsWindowContentReady = false;

export function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindowContentReady) {
      settingsWindow.show();
      settingsWindow.focus();
    }
    return;
  }

  settingsWindowContentReady = false;
  settingsWindow = createDesktopWindow({
    bounds: {
      defaultBounds: { height: 540, width: 680 },
      minimumBounds: { height: 420, width: 560 },
      stateFileName: settingsWindowStateFileName,
    },
    hash: "/settings",
    options: {
      height: 540,
      minHeight: 420,
      minWidth: 560,
      show: false,
      title: "Settings",
      width: 680,
    },
    stateFileName: settingsWindowStateFileName,
  });

  const window = settingsWindow;
  let didFinishLoad = false;
  let readyToShow = false;
  const showWhenReady = () => {
    if (window.isDestroyed() || settingsWindow !== window) return;
    if (!didFinishLoad || !readyToShow) return;

    settingsWindowContentReady = true;
    window.show();
    window.focus();
  };
  const markWebContentsLoaded = () => {
    didFinishLoad = true;
    showWhenReady();
  };

  window.webContents.once("did-finish-load", markWebContentsLoaded);
  window.webContents.once("did-fail-load", markWebContentsLoaded);
  window.once("ready-to-show", () => {
    readyToShow = true;
    showWhenReady();
  });

  window.on("closed", () => {
    settingsWindow = null;
    settingsWindowContentReady = false;
  });
}
