import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import fixPath from "fix-path";

import { beforeQuit, bootstrap } from "./bootstrap";
import { checkForUpdatesInBackground } from "./updater";
import { createMainWindow } from "./windows/main-window";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

if (process.platform === "win32") {
  app.setAppUserModelId(process.execPath);
}

fixPath();

void app
  .whenReady()
  .then(bootstrap)
  .catch((error: unknown) => {
    console.error("Failed to bootstrap app.", error);
    app.quit();
  });

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
  checkForUpdatesInBackground();
});
