import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";

import { beforeQuit, bootstrap } from "./bootstrap";
import { restoreShellPath } from "./platform/shell-path";
import { createMainWindow } from "./windows/main-window";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

if (process.platform === "win32") {
  app.setAppUserModelId(process.execPath);
}

restoreShellPath();

app.whenReady().then(bootstrap);

app.on("before-quit", beforeQuit);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
