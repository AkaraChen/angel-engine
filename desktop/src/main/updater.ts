import type {
  ProgressInfo,
  UpdateCheckResult,
  UpdateInfo,
} from "electron-updater";
import type {
  DesktopUpdateDownloadedEvent,
  DesktopUpdateMessageAction,
  DesktopUpdateMessageEvent,
} from "../shared/desktop-window";
import type {
  DesktopUpdateChannel,
  DesktopUpdateDownloadProgress,
  DesktopUpdateState,
  DesktopUpdateStatus,
} from "../shared/update-channel";

import type { BrowserWindow } from "electron";

import { app, ipcMain } from "electron";
import log from "electron-log/main";
import { autoUpdater, CancellationToken } from "electron-updater";

import {
  DESKTOP_UPDATE_CHANNEL_SET_CHANNEL,
  DESKTOP_UPDATE_CHECK_CHANNEL,
  DESKTOP_UPDATE_DOWNLOADED_CHANNEL,
  DESKTOP_UPDATE_MESSAGE_CHANNEL,
  DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL,
  DESKTOP_UPDATE_STATUS_GET_CHANNEL,
} from "../shared/desktop-window";
import {
  feedChannelForUpdateChannel,
  parseUpdateChannel,
} from "../shared/update-channel";
import {
  mergeUpdateProgress,
  normalizeUpdateProgress,
  shouldBroadcastUpdateProgress,
} from "../shared/update-progress";
import { translate } from "./platform/i18n";
import {
  readUpdateChannelPreference,
  writeUpdateChannelPreference,
} from "./updater-preferences";
import { shouldRunBackgroundCheck } from "./updater-schedule";
import { getMainWindow } from "./windows/main-window";

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
let progress: DesktopUpdateDownloadProgress | undefined;
let lastProgressBroadcastAt: number | undefined;
let userInitiatedCheck = false;
let didRegisterIpc = false;
/**
 * Bumped whenever the channel changes. Work started under an older generation
 * belongs to the previous channel and must not reach the user.
 */
let generation = 0;
let checkInFlight: Promise<unknown> | undefined;
let recheckQueued = false;
let downloadGeneration = 0;
let downloadCancellation: CancellationToken | undefined;

export function configureAutoUpdates() {
  log.initialize();

  channel = readUpdateChannelPreference();

  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({
    provider: "github",
    ...updateRepository,
  });
  applyChannel(channel);

  // Checks and downloads are driven by their promises, not by the matching
  // events, so every result stays bound to the generation that started it.
  // `error` is not listened to for the same reason: electron-updater emits it
  // *and* rejects, which would report the same failure twice.
  autoUpdater.on("download-progress", (info) => {
    handleDownloadProgress(info);
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (downloadGeneration !== generation) {
      log.info(
        `Discarding ${info.version}: downloaded on a superseded update channel.`,
      );
      return;
    }

    notifyUpdateDownloaded(info);
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
    showUpdateMessage({
      actions: ["install"],
      detail: translate("updates.downloadedDetail"),
      message: translate("updates.downloaded"),
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
    showUpdateMessage({
      detail: translate("updates.unsupportedPlatformDetail"),
      message: translate("updates.unsupportedPlatform"),
    });
    return;
  }

  if (
    state === "checking" ||
    state === "downloading" ||
    state === "installing"
  ) {
    showUpdateMessage({
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
    progress,
    state,
    supported: supportsAutoUpdates,
  };
}

function setUpdateChannel(next: DesktopUpdateChannel) {
  if (next === channel) return;

  channel = next;
  generation += 1;
  writeUpdateChannelPreference(next);
  applyChannel(next);

  // A download in flight is fetching the other channel's build. Stop it, or it
  // would finish and offer itself for install under the new channel.
  downloadCancellation?.cancel();
  downloadCancellation = undefined;

  // Anything staged belongs to the old channel, and the throttle must not hold
  // back the first check on the new one.
  availableVersion = undefined;
  lastCheckStartedAt = undefined;
  clearProgress();
  setState("idle");

  if (supportsAutoUpdates && app.isPackaged) {
    startCheck();
  }
}

function applyChannel(next: DesktopUpdateChannel) {
  autoUpdater.channel = feedChannelForUpdateChannel(next);
  autoUpdater.allowPrerelease = next === "beta";
  // electron-updater's `channel` setter force-enables `allowDowngrade`, so this
  // has to come after it — every time, not just at startup. Turning beta off
  // leaves the user on their current build until stable catches up; rolling a
  // newer database back onto an older app is not safe.
  autoUpdater.allowDowngrade = false;
}

function startCheck() {
  if (checkInFlight) {
    // electron-updater hands back the in-flight promise, which still resolves
    // against the channel that check started on. Queue a fresh one instead.
    recheckQueued = true;
    return;
  }

  const checkGeneration = generation;
  lastCheckStartedAt = Date.now();
  clearProgress();
  setState("checking");

  checkInFlight = autoUpdater
    .checkForUpdates()
    .then(async (result) => {
      await handleCheckResult(result, checkGeneration);
    })
    .catch((error: unknown) => {
      handleUpdateError(error, checkGeneration);
    })
    .finally(() => {
      checkInFlight = undefined;
      if (!recheckQueued) return;

      recheckQueued = false;
      startCheck();
    });
}

async function handleCheckResult(
  result: UpdateCheckResult | null,
  checkGeneration: number,
) {
  if (checkGeneration !== generation) {
    log.info("Discarding update check result from a superseded channel.");
    return;
  }

  lastCheckedAt = Date.now();

  const version = result?.updateInfo.version;
  if (result === null || version === undefined || !result.isUpdateAvailable) {
    availableVersion = undefined;
    clearProgress();
    setState("idle");
    showUpToDateMessage();
    return;
  }

  availableVersion = version;
  clearProgress();
  setState("downloading");

  const cancellation = new CancellationToken();
  downloadCancellation = cancellation;
  downloadGeneration = checkGeneration;

  try {
    await autoUpdater.downloadUpdate(cancellation);
    // `update-downloaded` usually fires before this promise resolves. If the
    // package is still verifying, surface that as an explicit installing state
    // instead of looking stuck mid-download with a frozen percent.
    if (
      checkGeneration === generation &&
      downloadGeneration === generation &&
      state === "downloading"
    ) {
      clearProgress();
      setState("installing");
    }
  } catch (error: unknown) {
    handleUpdateError(error, checkGeneration);
  } finally {
    if (downloadCancellation === cancellation) {
      downloadCancellation = undefined;
    }
  }
}

function handleDownloadProgress(info: ProgressInfo) {
  if (downloadGeneration !== generation) return;
  if (state !== "downloading" && state !== "installing") return;

  const next = mergeUpdateProgress(progress, normalizeUpdateProgress(info));
  progress = next;

  // Once every byte is in, the remaining work is verification — not download.
  if (
    next.percent !== undefined &&
    next.percent >= 100 &&
    state === "downloading"
  ) {
    setState("installing");
    return;
  }

  const now = Date.now();
  if (
    !shouldBroadcastUpdateProgress({
      lastBroadcastAt: lastProgressBroadcastAt,
      now,
    })
  ) {
    return;
  }

  lastProgressBroadcastAt = now;
  sendStatusToMainWindow();
}

function clearProgress() {
  progress = undefined;
  lastProgressBroadcastAt = undefined;
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

function handleUpdateError(error: unknown, checkGeneration: number) {
  if (checkGeneration !== generation) {
    // Cancelled by a channel switch, or a failure that belongs to the channel
    // the user just left. Either way it is not worth reporting.
    log.info("Ignoring update failure from a superseded channel.", error);
    return;
  }

  const detail =
    error instanceof Error
      ? error.message
      : translate("updates.checkFailedDetail");

  // Set the message before broadcasting so the first error frame is complete
  // (retryable) rather than a blank danger state the UI has to fill in later.
  errorMessage = detail;
  clearProgress();
  state = "error";
  sendStatusToMainWindow();
  log.warn("Could not check for updates.", error);

  if (!userInitiatedCheck) return;

  userInitiatedCheck = false;
  showUpdateMessage({
    detail,
    message: translate("updates.checkFailed"),
    tone: "error",
  });
}

function setState(next: DesktopUpdateState) {
  state = next;
  if (next !== "error") {
    errorMessage = undefined;
  }
  // Only the downloading phase owns byte progress. Checking / installing /
  // ready / error use copy + spinners, never a frozen percent bar.
  if (next !== "downloading") {
    clearProgress();
  }

  sendStatusToMainWindow();
}

function sendStatusToMainWindow() {
  const status = getUpdateStatus();
  const window = getMainWindow();
  if (!window) return;
  window.webContents.send(DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL, status);
}

function notifyUpdateDownloaded(
  info: Pick<UpdateInfo, "releaseName" | "releaseNotes" | "version">,
) {
  availableVersion = info.version;
  userInitiatedCheck = false;
  clearProgress();
  setState("downloaded");

  const event: DesktopUpdateDownloadedEvent = {
    releaseName:
      info.releaseName ??
      translate("updates.devPreviewVersion", {
        version: info.version,
      }),
    releaseNotes: updateReleaseNotes(info),
  };

  const window = getMainWindow();
  if (window) sendUpdateDownloaded(window, event);
}

function showUpToDateMessage() {
  if (!userInitiatedCheck) return;

  userInitiatedCheck = false;
  showUpdateMessage({
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

/**
 * Update notices render only in the main window. With no main window open there
 * is nothing to show, so transient notices are dropped; update state remains in
 * this process and is recovered by the next main window through getUpdateStatus.
 */
function showUpdateMessage({
  actions = [],
  detail,
  message,
  tone = "info",
}: {
  actions?: DesktopUpdateMessageAction[];
  detail: string;
  message: string;
  tone?: "error" | "info";
}) {
  const targetWindow = getMainWindow();
  if (!targetWindow) {
    log.info(`Dropping update notice with no main window: ${message}`);
    return;
  }

  const event: DesktopUpdateMessageEvent = { actions, detail, message, tone };
  targetWindow.webContents.send(DESKTOP_UPDATE_MESSAGE_CHANNEL, event);
}
