import type { IpcRendererEvent } from "electron";
import type {
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
  DesktopWindowCommand,
} from "../../shared/desktop-window";

import { contextBridge, ipcRenderer } from "electron";
import {
  DESKTOP_ACTIVE_CHAT_SET_CHANNEL,
  DESKTOP_COMMAND_CHANNEL,
  DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL,
  DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
  DESKTOP_SETTINGS_OPEN_CHANNEL,
  DESKTOP_THEME_SET_CHANNEL,
} from "../../shared/desktop-window";

export function exposeDesktopWindowBridge() {
  contextBridge.exposeInMainWorld("desktopWindow", {
    async confirmDeleteAllChats() {
      return ipcRenderer.invoke(DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL);
    },
    onCommand(handler: (command: DesktopWindowCommand) => void) {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (!isDesktopWindowCommandEvent(payload)) return;
        handler(payload.command);
      };

      ipcRenderer.on(DESKTOP_COMMAND_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(DESKTOP_COMMAND_CHANNEL, listener);
      };
    },
    onOpenChatFromNotification(
      handler: (event: DesktopOpenChatFromNotificationEvent) => void,
    ) {
      const listener = (
        _event: IpcRendererEvent,
        payload: DesktopOpenChatFromNotificationEvent,
      ) => handler(payload);

      ipcRenderer.on(DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
          listener,
        );
      };
    },
    openSettings() {
      ipcRenderer.send(DESKTOP_SETTINGS_OPEN_CHANNEL);
    },
    setActiveChatId(chatId: string | null) {
      ipcRenderer.send(DESKTOP_ACTIVE_CHAT_SET_CHANNEL, chatId);
    },
    setTheme(input: DesktopThemeSetInput) {
      ipcRenderer.send(DESKTOP_THEME_SET_CHANNEL, input);
    },
  });
}

function isDesktopWindowCommandEvent(
  value: unknown,
): value is { command: DesktopWindowCommand } {
  if (typeof value !== "object" || value === null) return false;
  const command = (value as { command?: unknown }).command;
  return (
    command === "new-chat" ||
    command === "open-settings" ||
    command === "toggle-sidebar"
  );
}
