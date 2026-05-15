import { contextBridge, webUtils } from "electron";

export function exposeDesktopEnvironmentBridge() {
  contextBridge.exposeInMainWorld("desktopEnvironment", {
    getPathForFile(file: File) {
      return webUtils.getPathForFile(file) || null;
    },
    platform: process.platform,
  });
}
