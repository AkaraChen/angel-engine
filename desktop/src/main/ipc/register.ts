import { registerIpcMain } from "@egoist/tipc/main";

import { ipcMain } from "electron";
import { DESKTOP_SETTINGS_OPEN_CHANNEL } from "../../shared/desktop-window";
import { registerDaemonIpc } from "../daemon/supervisor";
import { registerWorkspaceBrowserIpc } from "../features/workspace-browser/ipc";
import { registerDesktopWindowAppearanceIpc } from "../windows/appearance";
import { registerDesktopWindowIpc } from "../windows/notifications";
import { registerWorkspaceToolWindowIpc } from "../windows/workspace-tool-window";
import { createAppRouter } from "./router";

interface RegisterAllIpcOptions {
  openSettingsWindow: () => void;
}

export function registerAllIpc({ openSettingsWindow }: RegisterAllIpcOptions) {
  registerDaemonIpc();
  registerIpcMain(createAppRouter());
  registerDesktopWindowAppearanceIpc();
  registerDesktopWindowIpc();
  registerWorkspaceToolWindowIpc();
  registerWorkspaceBrowserIpc();
  ipcMain.on(DESKTOP_SETTINGS_OPEN_CHANNEL, openSettingsWindow);
}
