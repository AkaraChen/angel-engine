import type { UpdateCheckResult, UpdateInfo } from "electron-updater";
import type {
  DesktopUpdateDownloadedEvent,
  DesktopUpdateMessageAction,
  DesktopUpdateMessageEvent,
} from "../shared/desktop-window";
import type {
  DesktopUpdateChannel,
  DesktopUpdateState,
  DesktopUpdateStatus,
} from "../shared/update-channel";

import { app, BrowserWindow, ipcMain } from "electron";
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

  if (state === "checking" || state === "downloading") {
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
    setState("idle");
    showUpToDateMessage();
    return;
  }

  availableVersion = version;
  setState("downloading");

  const cancellation = new CancellationToken();
  downloadCancellation = cancellation;
  downloadGeneration = checkGeneration;

  try {
    await autoUpdater.downloadUpdate(cancellation);
  } catch (error: unknown) {
    handleUpdateError(error, checkGeneration);
  } finally {
    if (downloadCancellation === cancellation) {
      downloadCancellation = undefined;
    }
  }
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

  setState("error");
  errorMessage = detail;
  broadcastStatus();
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
 * Update notices render as an in-app dialog in the renderer. The focused window
 * gets it so the notice lands where the user is looking; with no window open
 * there is nothing to show and the notice is dropped, exactly as a message box
 * with no parent would be dismissed unseen.
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
  const targetWindow =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (targetWindow === undefined || targetWindow.isDestroyed()) {
    log.info(`Dropping update notice with no window to show it in: ${message}`);
    return;
  }

  const event: DesktopUpdateMessageEvent = { actions, detail, message, tone };
  targetWindow.webContents.send(DESKTOP_UPDATE_MESSAGE_CHANNEL, event);
}
