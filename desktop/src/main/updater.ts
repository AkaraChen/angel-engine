import type { UpdateInfo } from "electron-updater";
import type { DesktopUpdateDownloadedEvent } from "../shared/desktop-window";
import type {
  DesktopUpdateChannel,
  DesktopUpdateState,
  DesktopUpdateStatus,
} from "../shared/update-channel";

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import log from "electron-log/main";
import { autoUpdater } from "electron-updater";

import {
  DESKTOP_UPDATE_CHANNEL_SET_CHANNEL,
  DESKTOP_UPDATE_CHECK_CHANNEL,
  DESKTOP_UPDATE_DOWNLOADED_CHANNEL,
  DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL,
  DESKTOP_UPDATE_STATUS_GET_CHANNEL,
} from "../shared/desktop-window";
import {
  feedChannelForUpdateChannel,
  parseUpdateChannel,
} from "../shared/update-channel";
import { translate } from "./platform/i18n";
import {
  readUpdateChannelPreference,
  writeUpdateChannelPreference,
} from "./updater-preferences";
import { shouldRunBackgroundCheck } from "./updater-schedule";

const updateRepository = {
  owner: "AkaraChen",
  repo: "angel-engine",
} as const;
const supportsAutoUpdates = process.platform === "darwin";

let channel: DesktopUpdateChannel = "stable";
let state: DesktopUpdateState = "idle";
let availableVersion: string | undefined;
let errorMessage: string | undefined;
let lastCheckedAt: number | undefined;
let lastCheckStartedAt: number | undefined;
let userInitiatedCheck = false;
let didRegisterIpc = false;

export function configureAutoUpdates() {
  log.initialize();

  channel = readUpdateChannelPreference();

  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Turning beta off leaves the user on their current build until stable
  // catches up. Rolling a newer database back onto an older app is not safe.
  autoUpdater.allowDowngrade = false;
  autoUpdater.setFeedURL({
    provider: "github",
    ...updateRepository,
  });
  applyChannel(channel);

  autoUpdater.on("checking-for-update", () => {
    setState("checking");
  });
  autoUpdater.on("update-not-available", () => {
    lastCheckedAt = Date.now();
    availableVersion = undefined;
    setState("idle");
    void showUpToDateMessage();
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    lastCheckedAt = Date.now();
    availableVersion = info.version;
    setState("downloading");
    autoUpdater.downloadUpdate().catch((error: unknown) => {
      handleUpdateError(error);
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    notifyUpdateDownloaded(info);
  });
  autoUpdater.on("error", (error) => {
    handleUpdateError(error);
  });

  registerUpdaterIpc();

  app.on("browser-window-focus", () => {
    checkForUpdatesInBackground();
  });
  app.on("activate", () => {
    checkForUpdatesInBackground();
  });
}

export function checkForUpdatesInBackground() {
  const allowed = shouldRunBackgroundCheck({
    lastCheckStartedAt,
    now: Date.now(),
    packaged: app.isPackaged,
    state,
    supported: supportsAutoUpdates,
  });
  if (!allowed) return;

  startCheck();
}

export function checkForUpdatesFromMenu() {
  if (state === "downloaded") {
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

  if (state === "checking" || state === "downloading") {
    void showUpdateMessage({
      detail: translate("updates.checkingDetail"),
      message: translate("updates.checking"),
    });
    return;
  }

  userInitiatedCheck = true;
  startCheck();
}

export function installDownloadedUpdate() {
  if (state !== "downloaded") return;
  autoUpdater.quitAndInstall();
}

function getUpdateStatus(): DesktopUpdateStatus {
  return {
    availableVersion,
    channel,
    currentVersion: app.getVersion(),
    errorMessage,
    lastCheckedAt,
    state,
    supported: supportsAutoUpdates,
  };
}

function setUpdateChannel(next: DesktopUpdateChannel) {
  if (next === channel) return;

  channel = next;
  writeUpdateChannelPreference(next);
  applyChannel(next);

  // Anything staged belongs to the old channel, and the throttle must not hold
  // back the first check on the new one.
  availableVersion = undefined;
  lastCheckStartedAt = undefined;
  setState("idle");

  if (supportsAutoUpdates && app.isPackaged) {
    startCheck();
  }
}

function applyChannel(next: DesktopUpdateChannel) {
  autoUpdater.channel = feedChannelForUpdateChannel(next);
  autoUpdater.allowPrerelease = next === "beta";
}

function startCheck() {
  lastCheckStartedAt = Date.now();
  setState("checking");
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    handleUpdateError(error);
  });
}

function registerUpdaterIpc() {
  if (didRegisterIpc) return;
  didRegisterIpc = true;

  ipcMain.handle(DESKTOP_UPDATE_STATUS_GET_CHANNEL, () => getUpdateStatus());

  ipcMain.handle(DESKTOP_UPDATE_CHECK_CHANNEL, () => {
    if (supportsAutoUpdates && app.isPackaged && state !== "downloaded") {
      startCheck();
    }

    return getUpdateStatus();
  });

  ipcMain.handle(
    DESKTOP_UPDATE_CHANNEL_SET_CHANNEL,
    (_event, input: unknown) => {
      setUpdateChannel(readChannelInput(input));

      return getUpdateStatus();
    },
  );
}

function readChannelInput(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return parseUpdateChannel(undefined);
  }

  return parseUpdateChannel((input as { channel?: unknown }).channel);
}

function handleUpdateError(error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : translate("updates.checkFailedDetail");

  setState("error");
  errorMessage = detail;
  broadcastStatus();
  log.warn("Could not check for updates.", error);

  if (!userInitiatedCheck) return;

  userInitiatedCheck = false;
  void showUpdateMessage({
    detail,
    message: translate("updates.checkFailed"),
    type: "error",
  });
}

function setState(next: DesktopUpdateState) {
  state = next;
  if (next !== "error") {
    errorMessage = undefined;
  }

  broadcastStatus();
}

function broadcastStatus() {
  const status = getUpdateStatus();

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL, status);
  }
}

function notifyUpdateDownloaded(
  info: Pick<UpdateInfo, "releaseName" | "releaseNotes" | "version">,
) {
  availableVersion = info.version;
  userInitiatedCheck = false;
  setState("downloaded");

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

async function showUpToDateMessage() {
  if (!userInitiatedCheck) return;

  userInitiatedCheck = false;
  await showUpdateMessage({
    detail: translate("updates.upToDateDetail", {
      version: app.getVersion(),
    }),
    message: translate("updates.upToDate"),
  });
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
