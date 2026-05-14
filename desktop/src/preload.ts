import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from "electron";

import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
  type ChatStreamApi,
  type ChatStreamElicitationResolveInput,
  type ChatSendInput,
  type ChatStreamEvent,
  type ChatStreamStartInput,
} from "./shared/chat";
import {
  DESKTOP_ACTIVE_CHAT_SET_CHANNEL,
  DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
  DESKTOP_THEME_SET_CHANNEL,
  type DesktopThemeSetInput,
  type DesktopOpenChatFromNotificationEvent,
} from "./shared/desktop-window";

contextBridge.exposeInMainWorld("desktopEnvironment", {
  getPathForFile(file: File) {
    return webUtils.getPathForFile(file) || null;
  },
  platform: process.platform,
});
contextBridge.exposeInMainWorld("desktopWindow", {
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
