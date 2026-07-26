import { BrowserWindow, screen } from "electron";

import { createDesktopWindow } from "./factory";

const settingsWindowStateFileName = "settings-window-state.json";
const settingsWindowMinimumBounds = { height: 520, width: 680 };
/**
 * Settings is a fixed-shape utility window, not a workspace: the rail is 224px
 * and the content column caps at 42rem, so growing with the display only adds
 * dead space. Size to the content and let the user resize from there.
 */
const settingsWindowPreferredBounds = { height: 660, width: 920 };

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
  const width = Math.min(
    settingsWindowPreferredBounds.width,
    Math.max(settingsWindowMinimumBounds.width, workArea.width - 80),
  );
  const height = Math.min(
    settingsWindowPreferredBounds.height,
    Math.max(settingsWindowMinimumBounds.height, workArea.height - 80),
  );

  return {
    height,
    width,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  };
}
