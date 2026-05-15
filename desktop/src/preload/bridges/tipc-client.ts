import { contextBridge, ipcRenderer } from "electron";

export function exposeTipcClientBridge() {
  contextBridge.exposeInMainWorld("tipc", {
    invoke: async (channel: string, input?: unknown) =>
      ipcRenderer.invoke(channel, input),
  });
}
