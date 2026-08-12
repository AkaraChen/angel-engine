import { BrowserWindow, screen } from "electron";

import { translate } from "../platform/i18n";
import { isDesktopWindowContentReady } from "./content-ready";
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

export function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // While the window is still waiting for its first paint the content-ready
    // gate owns the reveal; showing here would surface an empty window.
    if (isDesktopWindowContentReady(settingsWindow)) {
      settingsWindow.show();
      settingsWindow.focus();
    }
    return;
  }

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
      title: translate("workspace.settings"),
    },
    role: "settings",
    stateFileName: settingsWindowStateFileName,
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

export function refreshSettingsWindowTitle() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  settingsWindow.setTitle(translate("workspace.settings"));
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
