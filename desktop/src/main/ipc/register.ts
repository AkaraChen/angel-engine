import { registerIpcMain } from "@egoist/tipc/main";

import { ipcMain } from "electron";
import { DESKTOP_SETTINGS_OPEN_CHANNEL } from "../../shared/desktop-window";
import { registerDaemonIpc } from "../daemon/supervisor";
import { prewarmPathLauncher } from "../features/path-launcher/runtime";
import { registerWorkspaceBrowserIpc } from "../features/workspace-browser/ipc";
import { registerDesktopWindowAppearanceIpc } from "../windows/appearance";
import { registerDesktopWindowContentReadyIpc } from "../windows/content-ready";
import { registerDesktopWindowIpc } from "../windows/notifications";
import { registerWorkspaceToolWindowIpc } from "../windows/workspace-tool-window";
import { createAppRouter } from "./router";
import { registerWorkspaceDiffPreferencesIpc } from "../workspace-diff-preferences";

interface RegisterAllIpcOptions {
  openSettingsWindow: () => void;
}

export function registerAllIpc({ openSettingsWindow }: RegisterAllIpcOptions) {
  registerDaemonIpc();
  registerIpcMain(createAppRouter());
  registerDesktopWindowAppearanceIpc();
  registerDesktopWindowContentReadyIpc();
  registerDesktopWindowIpc();
  registerWorkspaceToolWindowIpc();
  registerWorkspaceBrowserIpc();
  registerWorkspaceDiffPreferencesIpc();
  ipcMain.on(DESKTOP_SETTINGS_OPEN_CHANNEL, openSettingsWindow);
  void prewarmPathLauncher().catch((error: unknown) => {
    console.warn("Could not prewarm path launcher.", error);
  });
}
