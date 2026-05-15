import type { IpcRendererEvent } from "electron";
import type {
  ChatSendInput,
  ChatStreamApi,
  ChatStreamElicitationResolveInput,
  ChatStreamEvent,
  ChatStreamStartInput,
} from "../../shared/chat";

import { contextBridge, ipcRenderer } from "electron";
import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
} from "../../shared/chat";

export function exposeChatStreamBridge() {
  const chatStreamApi = {
    send(
      input: ChatSendInput,
      onEvent: (streamEvent: ChatStreamEvent) => void,
    ) {
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
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createStreamId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
