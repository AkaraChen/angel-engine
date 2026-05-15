import type { ChatRuntime } from "../features/chat/runtime";
import { registerIpcMain } from "@egoist/tipc/main";

import { ipcMain } from "electron";
import { DESKTOP_SETTINGS_OPEN_CHANNEL } from "../../shared/desktop-window";
import { registerChatStreamIpc } from "../features/chat/stream-handler";
import { registerDesktopWindowAppearanceIpc } from "../windows/appearance";
import { registerDesktopWindowIpc } from "../windows/notifications";
import { createAppRouter } from "./router";

interface RegisterAllIpcOptions {
  chatRuntime: ChatRuntime;
  openSettingsWindow: () => void;
}

export function registerAllIpc({
  chatRuntime,
  openSettingsWindow,
}: RegisterAllIpcOptions) {
  registerIpcMain(createAppRouter(chatRuntime));
  registerDesktopWindowAppearanceIpc();
  registerDesktopWindowIpc();
  registerChatStreamIpc(chatRuntime);
  ipcMain.on(DESKTOP_SETTINGS_OPEN_CHANNEL, openSettingsWindow);
}
