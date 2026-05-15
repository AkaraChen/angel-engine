import type { IpcRendererEvent } from "electron";

import type {
  ChatSendInput,
  ChatStreamApi,
  ChatStreamElicitationResolveInput,
  ChatStreamEvent,
  ChatStreamStartInput,
} from "../shared/chat";
import type {
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
  DesktopWindowCommand,
} from "../shared/desktop-window";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
} from "../shared/chat";
import {
  DESKTOP_ACTIVE_CHAT_SET_CHANNEL,
  DESKTOP_COMMAND_CHANNEL,
  DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL,
  DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
  DESKTOP_SETTINGS_OPEN_CHANNEL,
  DESKTOP_THEME_SET_CHANNEL,
} from "../shared/desktop-window";

contextBridge.exposeInMainWorld("desktopEnvironment", {
  getPathForFile(file: File) {
    return webUtils.getPathForFile(file) || null;
  },
  platform: process.platform,
});
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
contextBridge.exposeInMainWorld("ipcInvoke", ipcRenderer.invoke);
const chatStreamApi = {
  send(input: ChatSendInput, onEvent: (streamEvent: ChatStreamEvent) => void) {
    const streamId = createStreamId();
    const channel = chatStreamEventChannel(streamId);
    let disposed = false;
    const listener = (
      _event: IpcRendererEvent,
      streamEvent: ChatStreamEvent,
    ) => {
      if (!disposed) onEvent(streamEvent);
    };

    ipcRenderer.on(channel, listener);
    void ipcRenderer
      .invoke(CHAT_STREAM_START_CHANNEL, {
        input,
        streamId,
      } satisfies ChatStreamStartInput)
      .catch((error: unknown) => {
        if (disposed) return;
        onEvent({ message: getErrorMessage(error), type: "error" });
        onEvent({ type: "done" });
      });

    return {
      cancel() {
        disposed = true;
        ipcRenderer.removeListener(channel, listener);
        void ipcRenderer.invoke(CHAT_STREAM_CANCEL_CHANNEL, streamId);
      },
      async resolveElicitation(input) {
        await ipcRenderer.invoke(CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL, {
          ...input,
          streamId,
        } satisfies ChatStreamElicitationResolveInput);
      },
    };
  },
} satisfies ChatStreamApi;

contextBridge.exposeInMainWorld("chatStream", chatStreamApi);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createStreamId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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
