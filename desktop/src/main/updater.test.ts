import type { DesktopUpdateStatus } from "../shared/update-channel";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DESKTOP_UPDATE_CHANNEL_SET_CHANNEL,
  DESKTOP_UPDATE_CHECK_CHANNEL,
  DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL,
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
    autoUpdater: new FakeAutoUpdater(),
    cancellationTokens: [] as FakeCancellationToken[],
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
      { isDestroyed: () => false, webContents: { send: mocks.send } },
    ],
  },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 1 })) },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, input: unknown) => unknown,
    ) => {
      mocks.ipcHandlers.set(channel, handler);
    },
  },
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
    mocks.autoUpdater.checkForUpdates.mockReset();
    mocks.autoUpdater.downloadUpdate.mockReset();
    mocks.send.mockReset();
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
});
