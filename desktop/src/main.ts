import { app, BrowserWindow, ipcMain, shell } from "electron";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import started from "electron-squirrel-startup";
import { registerIpcMain } from "@egoist/tipc/main";

import { configureApplicationMenu } from "./main/application-menu";
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
import { persistWindowBounds, savedWindowBounds } from "./main/window-state";
import { DESKTOP_SETTINGS_OPEN_CHANNEL } from "./shared/desktop-window";

const isMacOS = process.platform === "darwin";
const settingsWindowStateFileName = "settings-window-state.json";

let settingsWindow: BrowserWindow | null = null;

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
    ...savedWindowBounds(),
    minHeight: 640,
    minWidth: 960,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  configureDesktopWindowAppearance(mainWindow);
  persistWindowBounds(mainWindow);
  configureExternalLinkHandling(mainWindow);
  configureDesktopWindowNotifications(mainWindow);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(rendererEntryUrl);
  } else {
    mainWindow.loadFile(rendererFilePath);
  }
};

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const rendererFilePath = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  const rendererEntryUrl = settingsRendererUrl(rendererFilePath);

  settingsWindow = new BrowserWindow({
    ...desktopWindowChromeOptions(),
    height: 540,
    minHeight: 420,
    minWidth: 560,
    show: false,
    title: "Settings",
    width: 680,
    ...savedWindowBounds({
      defaultBounds: { height: 540, width: 680 },
      minimumBounds: { height: 420, width: 560 },
      stateFileName: settingsWindowStateFileName,
    }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  configureDesktopWindowAppearance(settingsWindow);
  persistWindowBounds(settingsWindow, settingsWindowStateFileName);
  configureExternalLinkHandling(settingsWindow);
  configureDesktopWindowNotifications(settingsWindow);

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(rendererEntryUrl);
  } else {
    settingsWindow.loadFile(rendererFilePath, { hash: "/settings" });
  }
}

function settingsRendererUrl(rendererFilePath: string) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/settings`;
  }

  return pathToFileURL(rendererFilePath).href;
}

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
  ipcMain.on(DESKTOP_SETTINGS_OPEN_CHANNEL, openSettingsWindow);
  configureApplicationMenu({ openSettingsWindow });
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
