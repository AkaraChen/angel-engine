import type { DesktopUpdateStatus } from "../shared/update-channel";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DESKTOP_UPDATE_CHANNEL_SET_CHANNEL,
  DESKTOP_UPDATE_CHECK_CHANNEL,
  DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL,
  DESKTOP_UPDATE_STATUS_GET_CHANNEL,
} from "../shared/desktop-window";

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason: unknown) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });

  return { promise, reject, resolve };
}

const mocks = vi.hoisted(() => {
  interface FakeCancellationToken {
    cancel: () => void;
    cancelled: boolean;
  }

  /**
   * Mirrors electron-updater's real setter semantics: assigning `channel`
   * unconditionally re-enables `allowDowngrade` (AppUpdater.js).
   */
  class FakeAutoUpdater {
    allowDowngrade = true;
    allowPrerelease = false;
    autoDownload = true;
    autoInstallOnAppQuit = true;
    logger: unknown = undefined;
    checkForUpdates = vi.fn();
    downloadUpdate = vi.fn();
    quitAndInstall = vi.fn();
    setFeedURL = vi.fn();

    private handlers = new Map<string, (...args: never[]) => void>();
    private channelValue = "latest";

    get channel() {
      return this.channelValue;
    }

    set channel(value: string) {
      this.channelValue = value;
      this.allowDowngrade = true;
    }

    on(event: string, handler: (...args: never[]) => void) {
      this.handlers.set(event, handler);
      return this;
    }

    emit(event: string, payload: unknown) {
      this.handlers.get(event)?.(payload as never);
    }
  }

  return {
    auxiliarySend: vi.fn(),
    autoUpdater: new FakeAutoUpdater(),
    cancellationTokens: [] as FakeCancellationToken[],
    getMainWindow: vi.fn(),
    getVersion: vi.fn(() => "1.0.1-beta.1"),
    ipcHandlers: new Map<string, (event: unknown, input: unknown) => unknown>(),
    send: vi.fn(),
    writeUpdateChannelPreference: vi.fn(),
  };
});

vi.mock("electron", () => ({
  app: {
    getVersion: mocks.getVersion,
    isPackaged: true,
    on: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          isLoading: () => false,
          once: vi.fn(),
          send: mocks.auxiliarySend,
        },
      },
    ],
    getFocusedWindow: () => null,
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, input: unknown) => unknown,
    ) => {
      mocks.ipcHandlers.set(channel, handler);
    },
  },
}));

vi.mock("./windows/main-window", () => ({
  getMainWindow: mocks.getMainWindow,
}));

vi.mock("electron-updater", () => ({
  autoUpdater: mocks.autoUpdater,
  CancellationToken: class {
    cancelled = false;
    cancel() {
      this.cancelled = true;
    }

    constructor() {
      mocks.cancellationTokens.push(this);
    }
  },
}));

vi.mock("electron-log/main", () => ({
  default: { info: vi.fn(), initialize: vi.fn(), warn: vi.fn() },
}));

vi.mock("./platform/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("./updater-preferences", () => ({
  readUpdateChannelPreference: () => "beta",
  writeUpdateChannelPreference: mocks.writeUpdateChannelPreference,
}));

// Auto-updates are macOS-only, and the module reads `process.platform` once at
// import time. Pin it so the suite exercises the same path on every runner
// instead of silently going no-op on Linux CI.
Object.defineProperty(process, "platform", { value: "darwin" });

const { configureAutoUpdates } = await import("./updater");

function invokeIpc(channel: string, input?: unknown) {
  const handler = mocks.ipcHandlers.get(channel);
  if (!handler) throw new Error(`IPC handler ${channel} was never registered`);

  return handler(undefined, input) as DesktopUpdateStatus;
}

function setChannel(channel: string) {
  return invokeIpc(DESKTOP_UPDATE_CHANNEL_SET_CHANNEL, { channel });
}

/** Checks are user- or focus-triggered; configureAutoUpdates only arms them. */
function triggerCheck() {
  return invokeIpc(DESKTOP_UPDATE_CHECK_CHANNEL);
}

function broadcastStatuses() {
  return mocks.send.mock.calls
    .filter(([channel]) => channel === DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL)
    .map(([, status]) => status as DesktopUpdateStatus);
}

describe("configureAutoUpdates", () => {
  beforeEach(() => {
    mocks.auxiliarySend.mockReset();
    mocks.autoUpdater.checkForUpdates.mockReset();
    mocks.autoUpdater.downloadUpdate.mockReset();
    mocks.send.mockReset();
    mocks.getMainWindow.mockReset();
    mocks.getMainWindow.mockReturnValue({
      isDestroyed: () => false,
      webContents: {
        isLoading: () => false,
        once: vi.fn(),
        send: mocks.send,
      },
    });
    mocks.cancellationTokens.length = 0;
    mocks.autoUpdater.checkForUpdates.mockResolvedValue(null);
    mocks.autoUpdater.downloadUpdate.mockResolvedValue([]);
  });

  it("keeps allowDowngrade off even though the channel setter re-enables it", () => {
    configureAutoUpdates();

    expect(mocks.autoUpdater.channel).toBe("beta");
    expect(mocks.autoUpdater.allowPrerelease).toBe(true);
    expect(mocks.autoUpdater.allowDowngrade).toBe(false);
  });

  it("routes update status events only to the explicit main window", () => {
    configureAutoUpdates();
    mocks.send.mockClear();

    const current = invokeIpc(DESKTOP_UPDATE_STATUS_GET_CHANNEL);
    setChannel(current.channel === "beta" ? "stable" : "beta");

    expect(mocks.send).toHaveBeenCalledWith(
      DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL,
      expect.objectContaining({ state: "checking" }),
    );
    expect(mocks.auxiliarySend).not.toHaveBeenCalled();
  });

  it("keeps allowDowngrade off after switching channels", async () => {
    configureAutoUpdates();

    setChannel("stable");
    await vi.waitFor(() => {
      expect(mocks.autoUpdater.channel).toBe("latest");
    });

    expect(mocks.autoUpdater.allowPrerelease).toBe(false);
    expect(mocks.autoUpdater.allowDowngrade).toBe(false);
  });

  it("cancels an in-flight download and discards it when the channel changes", async () => {
    const download = deferred<string[]>();
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "1.1.0-beta.1" },
    });
    mocks.autoUpdater.downloadUpdate.mockReturnValue(download.promise);

    configureAutoUpdates();
    triggerCheck();

    await vi.waitFor(() => {
      expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    setChannel("stable");

    expect(mocks.cancellationTokens[0]?.cancelled).toBe(true);

    // The beta download finishes anyway — a cancel that lands too late must not
    // resurface the old build under the new channel.
    download.resolve([]);
    mocks.autoUpdater.emit("update-downloaded", { version: "1.1.0-beta.1" });

    const downloaded = broadcastStatuses().filter(
      (status) => status.state === "downloaded",
    );
    expect(downloaded).toStrictEqual([]);
  });

  it("does not join an in-flight check that started on the old channel", async () => {
    const firstCheck = deferred<null>();
    mocks.autoUpdater.checkForUpdates.mockReturnValueOnce(firstCheck.promise);
    mocks.autoUpdater.checkForUpdates.mockResolvedValue(null);

    configureAutoUpdates();
    triggerCheck();
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    setChannel("stable");
    // Still one call: the switch queues rather than reusing the beta check.
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    firstCheck.resolve(null);
    await vi.waitFor(() => {
      expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });
  });

  it("broadcasts download progress and never lets percent go backwards", async () => {
    const download = deferred<string[]>();
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "1.1.0-beta.1" },
    });
    mocks.autoUpdater.downloadUpdate.mockReturnValue(download.promise);

    configureAutoUpdates();
    triggerCheck();

    await vi.waitFor(() => {
      expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    mocks.send.mockClear();
    mocks.autoUpdater.emit("download-progress", {
      bytesPerSecond: 1_000,
      delta: 100,
      percent: 10,
      total: 1_000,
      transferred: 100,
    });
    expect(broadcastStatuses().at(-1)?.progress).toEqual({
      bytesPerSecond: 1_000,
      percent: 10,
      total: 1_000,
      transferred: 100,
    });

    // Second sample is still inside the throttle window: not broadcast, but
    // merged so a later sample never reports a lower percent.
    mocks.send.mockClear();
    mocks.autoUpdater.emit("download-progress", {
      bytesPerSecond: 2_000,
      delta: 50,
      percent: 8,
      total: 1_000,
      transferred: 80,
    });
    expect(broadcastStatuses()).toEqual([]);

    download.resolve([]);
    mocks.autoUpdater.emit("update-downloaded", { version: "1.1.0-beta.1" });
    await vi.waitFor(() => {
      expect(
        broadcastStatuses().some((status) => status.state === "downloaded"),
      ).toBe(true);
    });
  });

  it("surfaces install verification after the download reaches 100%", async () => {
    const download = deferred<string[]>();
    // A prior test may have left `downloaded`, which refuses another check.
    // Switching channel clears staged work and starts a fresh download.
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "1.2.0" },
    });
    mocks.autoUpdater.downloadUpdate.mockReturnValue(download.promise);

    configureAutoUpdates();
    setChannel("stable");

    await vi.waitFor(() => {
      expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    mocks.autoUpdater.emit("download-progress", {
      bytesPerSecond: 100,
      delta: 1_000,
      percent: 100,
      total: 1_000,
      transferred: 1_000,
    });

    expect(broadcastStatuses().at(-1)).toMatchObject({
      progress: undefined,
      state: "installing",
    });

    // Release the checkInFlight chain (it awaits downloadUpdate) so later
    // cases can start a new check without queuing behind this one.
    download.resolve([]);
    mocks.autoUpdater.emit("update-downloaded", { version: "1.2.0" });
    await vi.waitFor(() => {
      expect(
        broadcastStatuses().some((status) => status.state === "downloaded"),
      ).toBe(true);
    });
  });

  it("keeps the error state with a retryable message", async () => {
    mocks.autoUpdater.downloadUpdate.mockResolvedValue([]);
    mocks.autoUpdater.checkForUpdates.mockRejectedValue(
      new Error("network down"),
    );
    configureAutoUpdates();
    mocks.send.mockClear();
    // Same-channel set is a no-op; flip whatever the suite left us on so a
    // real check starts against the rejected mock.
    const current = invokeIpc(DESKTOP_UPDATE_STATUS_GET_CHANNEL);
    setChannel(current.channel === "beta" ? "stable" : "beta");

    await vi.waitFor(() => {
      expect(
        broadcastStatuses().some((status) => status.state === "error"),
      ).toBe(true);
    });
    const errorStatus = broadcastStatuses().find(
      (status) => status.state === "error",
    );
    expect(errorStatus?.errorMessage).toBe("network down");
  });
});
