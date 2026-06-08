import type { IpcRendererEvent } from "electron";
import type {
  TerminalApi,
  TerminalCreateInput,
  TerminalEvent,
} from "../../shared/terminal";

import { contextBridge, ipcRenderer } from "electron";
import {
  TERMINAL_CREATE_CHANNEL,
  TERMINAL_DISPOSE_CHANNEL,
  TERMINAL_KILL_CHANNEL,
  TERMINAL_RESIZE_CHANNEL,
  TERMINAL_WRITE_CHANNEL,
  terminalEventChannel,
} from "../../shared/terminal";

export function exposeTerminalBridge() {
  const terminalApi = {
    create(
      input: TerminalCreateInput,
      onEvent: (terminalEvent: TerminalEvent) => void,
    ) {
      const sessionId = input.sessionId ?? createSessionId();
      const channel = terminalEventChannel(sessionId);
      let disposed = false;
      const listener = (
        _event: IpcRendererEvent,
        terminalEvent: TerminalEvent,
      ) => {
        if (!disposed) onEvent(terminalEvent);
      };

      ipcRenderer.on(channel, listener);
      void ipcRenderer
        .invoke(TERMINAL_CREATE_CHANNEL, { ...input, sessionId })
        .catch((error: unknown) => {
          if (disposed) return;
          onEvent({ message: getErrorMessage(error), type: "error" });
        });

      return {
        dispose() {
          disposed = true;
          ipcRenderer.removeListener(channel, listener);
          void ipcRenderer.invoke(TERMINAL_DISPOSE_CHANNEL, { sessionId });
        },
        kill() {
          disposed = true;
          ipcRenderer.removeListener(channel, listener);
          void ipcRenderer.invoke(TERMINAL_KILL_CHANNEL, { sessionId });
        },
        resize(nextSize) {
          void ipcRenderer.invoke(TERMINAL_RESIZE_CHANNEL, {
            ...nextSize,
            sessionId,
          });
        },
        sessionId,
        write(data) {
          void ipcRenderer.invoke(TERMINAL_WRITE_CHANNEL, {
            data,
            sessionId,
          });
        },
      };
    },
    kill(input) {
      void ipcRenderer.invoke(TERMINAL_KILL_CHANNEL, input);
    },
  } satisfies TerminalApi;

  contextBridge.exposeInMainWorld("terminal", terminalApi);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createSessionId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
