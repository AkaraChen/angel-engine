import type { UpdateInfo } from "electron-updater";
import type { DesktopUpdateDownloadedEvent } from "../shared/desktop-window";

import { app, BrowserWindow, dialog } from "electron";
import log from "electron-log/main";
import { autoUpdater } from "electron-updater";

import { DESKTOP_UPDATE_DOWNLOADED_CHANNEL } from "../shared/desktop-window";
import { translate } from "./platform/i18n";

const updateRepository = {
  owner: "AkaraChen",
  repo: "angel-engine",
} as const;
const supportsAutoUpdates = process.platform === "darwin";

let updateDownloaded = false;
let checkingForUpdates = false;
let userInitiatedCheck = false;

export function configureAutoUpdates() {
  log.initialize();

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = true;
  autoUpdater.setFeedURL({
    provider: "github",
    ...updateRepository,
  });

  autoUpdater.on("checking-for-update", () => {
    checkingForUpdates = true;
  });
  autoUpdater.on("update-not-available", () => {
    checkingForUpdates = false;
    if (userInitiatedCheck) {
      userInitiatedCheck = false;
      void showUpdateMessage({
        detail: translate("updates.upToDateDetail", {
          version: app.getVersion(),
        }),
        message: translate("updates.upToDate"),
      });
    }
  });
  autoUpdater.on("update-available", () => {
    checkingForUpdates = false;
  });
  autoUpdater.on("update-downloaded", (info) => {
    notifyUpdateDownloaded(info);
  });
  autoUpdater.on("error", (error) => {
    checkingForUpdates = false;
    if (userInitiatedCheck) {
      userInitiatedCheck = false;
      void showUpdateMessage({
        detail:
          error instanceof Error
            ? error.message
            : translate("updates.checkFailedDetail"),
        message: translate("updates.checkFailed"),
        type: "error",
      });
    }
    log.warn("Could not check for updates.", error);
  });

  app.on("browser-window-focus", () => {
    checkForUpdatesInBackground();
  });
  app.on("activate", () => {
    checkForUpdatesInBackground();
  });
}

export function checkForUpdatesInBackground() {
  if (
    !supportsAutoUpdates ||
    !app.isPackaged ||
    checkingForUpdates ||
    updateDownloaded
  ) {
    return;
  }

  checkingForUpdates = true;
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    checkingForUpdates = false;
    log.warn("Could not check for updates.", error);
  });
}

export function checkForUpdatesFromMenu() {
  if (updateDownloaded) {
    void showUpdateMessage({
      buttons: [
        translate("updates.restartAndInstall"),
        translate("common.cancel"),
      ],
      detail: translate("updates.downloadedDetail"),
      message: translate("updates.downloaded"),
    }).then(({ response }) => {
      if (response === 0) {
        installDownloadedUpdate();
      }
    });
    return;
  }

  if (!app.isPackaged) {
    notifyUpdateDownloaded({
      releaseName: translate("updates.devPreviewVersion", {
        version: app.getVersion(),
      }),
      releaseNotes: translate("updates.devPreviewNotes"),
      version: app.getVersion(),
    });
    return;
  }

  if (!supportsAutoUpdates) {
    void showUpdateMessage({
      detail: translate("updates.unsupportedPlatformDetail"),
      message: translate("updates.unsupportedPlatform"),
    });
    return;
  }

  if (checkingForUpdates) {
    void showUpdateMessage({
      detail: translate("updates.checkingDetail"),
      message: translate("updates.checking"),
    });
    return;
  }

  userInitiatedCheck = true;
  checkingForUpdates = true;
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    userInitiatedCheck = false;
    checkingForUpdates = false;
    void showUpdateMessage({
      detail:
        error instanceof Error
          ? error.message
          : translate("updates.checkFailedDetail"),
      message: translate("updates.checkFailed"),
      type: "error",
    });
    log.warn("Could not check for updates.", error);
  });
}

export function installDownloadedUpdate() {
  if (!updateDownloaded) return;
  autoUpdater.quitAndInstall();
}

function notifyUpdateDownloaded(
  info: Pick<UpdateInfo, "releaseName" | "releaseNotes" | "version">,
) {
  updateDownloaded = true;
  userInitiatedCheck = false;
  checkingForUpdates = false;

  const event: DesktopUpdateDownloadedEvent = {
    releaseName:
      info.releaseName ??
      translate("updates.devPreviewVersion", {
        version: info.version,
      }),
    releaseNotes: updateReleaseNotes(info),
  };

  for (const window of BrowserWindow.getAllWindows()) {
    sendUpdateDownloaded(window, event);
  }
}

function updateReleaseNotes(info: Pick<UpdateInfo, "releaseNotes">) {
  if (typeof info.releaseNotes === "string") return info.releaseNotes;
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes
      .map((note) => note.note)
      .filter(
        (note): note is string =>
          typeof note === "string" && note.trim().length > 0,
      )
      .join("\n\n");
  }
  return undefined;
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

async function showUpdateMessage({
  buttons,
  detail,
  message,
  type = "info",
}: {
  buttons?: string[];
  detail: string;
  message: string;
  type?: "error" | "info";
}) {
  const options = {
    buttons: buttons ?? [translate("common.close")],
    defaultId: 0,
    detail,
    message,
    noLink: true,
    title: translate("updates.title"),
    type,
  };
  const parentWindow =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

  return parentWindow !== undefined
    ? dialog.showMessageBox(parentWindow, options)
    : dialog.showMessageBox(options);
}
