import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
  type ChatStreamApi,
  type ChatSendInput,
  type ChatStreamEvent,
  type ChatStreamStartInput,
} from './shared/chat';

contextBridge.exposeInMainWorld('desktopEnvironment', {
  platform: process.platform,
});
contextBridge.exposeInMainWorld('ipcInvoke', ipcRenderer.invoke);
const chatStreamApi = {
  send(
    input: ChatSendInput,
    onEvent: (streamEvent: ChatStreamEvent) => void
  ) {
    const streamId = createStreamId();
    const channel = chatStreamEventChannel(streamId);
    let disposed = false;
    const listener = (
      _event: IpcRendererEvent,
      streamEvent: ChatStreamEvent
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
        onEvent({ message: getErrorMessage(error), type: 'error' });
        onEvent({ type: 'done' });
      });

    return () => {
      disposed = true;
      ipcRenderer.removeListener(channel, listener);
      void ipcRenderer.invoke(CHAT_STREAM_CANCEL_CHANNEL, streamId);
    };
  },
} satisfies ChatStreamApi;

contextBridge.exposeInMainWorld('chatStream', chatStreamApi);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createStreamId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
