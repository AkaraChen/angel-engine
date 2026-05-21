import type { IUpdateInfo } from "update-electron-app";

import { app, autoUpdater, BrowserWindow } from "electron";
import log from "electron-log/main";
import { updateElectronApp, UpdateSourceType } from "update-electron-app";

import {
  DESKTOP_UPDATE_DOWNLOADED_CHANNEL,
  type DesktopUpdateDownloadedEvent,
} from "../shared/desktop-window";

const updateRepository = "AkaraChen/angel-engine";

let updateDownloaded = false;
let checkingForUpdates = false;

export function configureAutoUpdates() {
  log.initialize();

  autoUpdater.on("checking-for-update", () => {
    checkingForUpdates = true;
  });
  autoUpdater.on("update-not-available", () => {
    checkingForUpdates = false;
  });
  autoUpdater.on("update-available", () => {
    checkingForUpdates = false;
  });
  autoUpdater.on("error", () => {
    checkingForUpdates = false;
  });

  updateElectronApp({
    logger: log,
    notifyUser: true,
    onNotifyUser: notifyUpdateDownloaded,
    updateInterval: "5 minutes",
    updateSource: {
      repo: updateRepository,
      type: UpdateSourceType.ElectronPublicUpdateService,
    },
  });

  app.on("browser-window-focus", () => {
    checkForUpdatesInBackground();
  });
  app.on("activate", () => {
    checkForUpdatesInBackground();
  });
}

export function checkForUpdatesInBackground() {
  if (!app.isPackaged || checkingForUpdates || updateDownloaded) return;

  try {
    checkingForUpdates = true;
    autoUpdater.checkForUpdates();
  } catch (error) {
    checkingForUpdates = false;
    log.warn("Could not check for updates.", error);
  }
}

export function installDownloadedUpdate() {
  if (!updateDownloaded) return;
  autoUpdater.quitAndInstall();
}

function notifyUpdateDownloaded(info: IUpdateInfo) {
  updateDownloaded = true;
  checkingForUpdates = false;

  const event: DesktopUpdateDownloadedEvent = {
    releaseName: info.releaseName,
    releaseNotes:
      typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
  };

  for (const window of BrowserWindow.getAllWindows()) {
    sendUpdateDownloaded(window, event);
  }
}

function sendUpdateDownloaded(
  window: BrowserWindow,
  event: DesktopUpdateDownloadedEvent,
) {
  if (window.isDestroyed()) return;

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", () => {
      if (!window.isDestroyed()) {
        window.webContents.send(DESKTOP_UPDATE_DOWNLOADED_CHANNEL, event);
      }
    });
    return;
  }

  window.webContents.send(DESKTOP_UPDATE_DOWNLOADED_CHANNEL, event);
}
