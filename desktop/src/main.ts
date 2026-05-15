import { app, BrowserWindow, shell } from "electron";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import started from "electron-squirrel-startup";
import { registerIpcMain } from "@egoist/tipc/main";

import { closeChatSession } from "./main/features/chat/angel-client";
import { registerChatStreamIpc } from "./main/features/chat/stream-ipc";
import { closeProjectsDatabase } from "./main/features/projects/repository";
import { getDatabase } from "./main/db/database";
import { appRouter } from "./main/ipc/app-router";
import {
  configureDesktopWindowAppearance,
  desktopWindowChromeOptions,
  registerDesktopWindowAppearanceIpc,
} from "./main/window-appearance";
import {
  configureDesktopWindowNotifications,
  registerDesktopWindowIpc,
} from "./main/window-notifications";

const isMacOS = process.platform === "darwin";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

if (process.platform === "win32") {
  app.setAppUserModelId(process.execPath);
}

restoreShellPath();

function restoreShellPath() {
  if (!isMacOS) {
    return;
  }

  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const shellPath = execFileSync(shell, ["-l", "-c", 'printf %s "$PATH"'], {
      encoding: "utf8",
      timeout: 5000,
    });
    process.env.PATH = mergePathEntries(shellPath, process.env.PATH);
  } catch {
    process.env.PATH = mergePathEntries(
      process.env.PATH,
      "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      `${process.env.HOME ?? ""}/.local/bin`,
    );
  }
}

function mergePathEntries(...paths: Array<string | undefined>) {
  const entries = paths
    .flatMap((value) => value?.split(":") ?? [])
    .filter((entry) => entry !== "")
    .filter(Boolean);

  return Array.from(new Set(entries)).join(":");
}

const createWindow = () => {
  const rendererFilePath = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  const rendererEntryUrl =
    MAIN_WINDOW_VITE_DEV_SERVER_URL ?? pathToFileURL(rendererFilePath).href;

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...desktopWindowChromeOptions(),
    height: 820,
    minHeight: 640,
    minWidth: 960,
    width: 1200,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  configureDesktopWindowAppearance(mainWindow);
  configureExternalLinkHandling(mainWindow);
  configureDesktopWindowNotifications(mainWindow);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(rendererEntryUrl);
  } else {
    mainWindow.loadFile(rendererFilePath);
  }
};

function configureExternalLinkHandling(mainWindow: BrowserWindow) {
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  getDatabase();
  registerIpcMain(appRouter);
  registerDesktopWindowAppearanceIpc();
  registerDesktopWindowIpc();
  registerChatStreamIpc();
  createWindow();
});

app.on("before-quit", () => {
  closeChatSession();
  closeProjectsDatabase();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
