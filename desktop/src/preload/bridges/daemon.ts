import type { IpcRendererEvent } from "electron";
import type { DaemonConnection } from "../../shared/daemon";
import type { MobileHostingState } from "../../shared/mobile-hosting";

import { contextBridge, ipcRenderer } from "electron";
import {
  DAEMON_CHANGED_CHANNEL,
  DAEMON_INFO_CHANNEL,
} from "../../shared/daemon";
import { MOBILE_HOSTING_CHANGED_CHANNEL } from "../../shared/mobile-hosting";

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
    onMobileHostingChanged(handler: (state: MobileHostingState) => void) {
      const listener = (
        _event: IpcRendererEvent,
        state: MobileHostingState,
      ) => {
        handler(state);
      };
      ipcRenderer.on(MOBILE_HOSTING_CHANGED_CHANNEL, listener);
      return () =>
        ipcRenderer.removeListener(MOBILE_HOSTING_CHANGED_CHANNEL, listener);
    },
  });
}
