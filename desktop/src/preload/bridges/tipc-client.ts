import { contextBridge, ipcRenderer } from "electron";

import { TIPC_CHANNEL_SET } from "../../shared/ipc-channels";
import { isMainIpcErrorEnvelope } from "../../shared/main-ipc-error";

export function exposeTipcClientBridge() {
  contextBridge.exposeInMainWorld("tipc", {
    invoke: async (channel: string, input?: unknown) => {
      if (!TIPC_CHANNEL_SET.has(channel)) {
        throw new Error(`Blocked IPC channel: ${channel}`);
      }
      const result: unknown = await ipcRenderer.invoke(channel, input);
      if (isMainIpcErrorEnvelope(result)) {
        throw Object.assign(new Error(result.__angelMainIpcError.message), {
          code: result.__angelMainIpcError.code,
        });
      }
      return result;
    },
  });
}
