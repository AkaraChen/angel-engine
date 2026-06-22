import { BrowserWindow, screen } from "electron";

import { createDesktopWindow } from "./factory";

const settingsWindowStateFileName = "settings-window-state.json";
const settingsWindowMinimumBounds = { height: 420, width: 560 };

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
  const defaultBounds = defaultSettingsWindowBounds();
  settingsWindow = createDesktopWindow({
    bounds: {
      defaultBounds,
      minimumBounds: settingsWindowMinimumBounds,
      stateFileName: settingsWindowStateFileName,
    },
    hash: "/settings",
    options: {
      minHeight: settingsWindowMinimumBounds.height,
      minWidth: settingsWindowMinimumBounds.width,
      show: false,
      title: "Settings",
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

function defaultSettingsWindowBounds() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const { workArea } =
    focusedWindow && !focusedWindow.isDestroyed()
      ? screen.getDisplayMatching(focusedWindow.getBounds())
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = Math.max(
    settingsWindowMinimumBounds.width,
    Math.round(workArea.width * 0.82),
  );
  const height = Math.max(
    settingsWindowMinimumBounds.height,
    Math.round(workArea.height * 0.82),
  );

  return {
    height,
    width,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  };
}
