import type { BrowserWindow } from "electron";

import { createDesktopWindow } from "./factory";

const settingsWindowStateFileName = "settings-window-state.json";

let settingsWindow: BrowserWindow | null = null;

export function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

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

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}
