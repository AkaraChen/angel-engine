import type { IpcRendererEvent } from "electron";
import type { DaemonConnection } from "../../shared/daemon";

import { contextBridge, ipcRenderer } from "electron";
import {
  DAEMON_CHANGED_CHANNEL,
  DAEMON_INFO_CHANNEL,
} from "../../shared/daemon";

export function exposeDaemonBridge() {
  contextBridge.exposeInMainWorld("daemon", {
    async getInfo() {
      return ipcRenderer.invoke(
        DAEMON_INFO_CHANNEL,
      ) as Promise<DaemonConnection>;
    },
    onChanged(handler: (connection: DaemonConnection) => void) {
      const listener = (
        _event: IpcRendererEvent,
        connection: DaemonConnection,
      ) => {
        handler(connection);
      };
      ipcRenderer.on(DAEMON_CHANGED_CHANNEL, listener);
      return () => ipcRenderer.removeListener(DAEMON_CHANGED_CHANNEL, listener);
    },
  });
}
