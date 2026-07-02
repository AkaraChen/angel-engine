import { contextBridge, ipcRenderer } from "electron";

import { TIPC_CHANNEL_SET } from "../../shared/ipc-channels";

export function exposeTipcClientBridge() {
  contextBridge.exposeInMainWorld("tipc", {
    invoke: async (channel: string, input?: unknown) => {
      if (!TIPC_CHANNEL_SET.has(channel)) {
        throw new Error(`Blocked IPC channel: ${channel}`);
      }
      return ipcRenderer.invoke(channel, input) as Promise<unknown>;
    },
  });
}
