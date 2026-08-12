import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeTray {
    destroy = vi.fn();
    on = vi.fn();
    setContextMenu = vi.fn();
    setIgnoreDoubleClickEvents = vi.fn();
    setTitle = vi.fn();
    setToolTip = vi.fn();
  }

  return {
    activityList: vi.fn(),
    chatsGet: vi.fn(),
    auxiliaryWindow: { isDestroyed: () => false },
    ensureMainWindow: vi.fn(() => ({
      focus: vi.fn(),
      isDestroyed: () => false,
      isMinimized: () => false,
      isVisible: () => true,
      restore: vi.fn(),
      show: vi.fn(),
    })),
    FakeTray,
    openChatInMainWindow: vi.fn(),
    readTrayPreferences: vi.fn(() => ({ enabled: true })),
    trayInstances: [] as InstanceType<typeof FakeTray>[],
    writeTrayPreferences: vi.fn(),
  };
});

vi.mock("electron", () => {
  return {
    app: {
      focus: vi.fn(),
      getAppPath: () => "/tmp/angel-engine-app",
      getPath: () => "/tmp/angel-engine-user-data",
    },
    BrowserWindow: {
      getAllWindows: () => [mocks.auxiliaryWindow],
    },
    Menu: {
      buildFromTemplate: (template: unknown) => template,
    },
    nativeImage: {
      createEmpty: () => ({ isEmpty: () => true }),
      createFromPath: () => ({
        getSize: () => ({ height: 16, width: 16 }),
        isEmpty: () => true,
        resize: () => ({ isEmpty: () => true }),
      }),
    },
    Tray: class {
      constructor() {
        const instance = new mocks.FakeTray();
        mocks.trayInstances.push(instance);
        return instance;
      }
    },
  };
});

vi.mock("electron-log/main", () => ({
  default: { warn: vi.fn() },
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: () => false,
  },
  existsSync: () => false,
}));

vi.mock("../../daemon/client", () => ({
  daemonClient: {
    activity: { list: mocks.activityList },
    chats: { get: mocks.chatsGet },
  },
}));

vi.mock("../../platform/i18n", () => ({
  translate: (key: string, options?: { count?: number }) => {
    if (key === "tray.needsYouCount") return `${options?.count ?? 0} need you`;
    if (key === "tray.tooltipNeedsYou") {
      return `Angel Engine — ${options?.count ?? 0} need you`;
    }
    if (key === "fleet.status.waitingForYou") return "Waiting for you";
    if (key === "fleet.status.running") return "Running";
    return key;
  },
}));

vi.mock("../../windows/main-window", () => ({
  ensureMainWindow: mocks.ensureMainWindow,
}));

vi.mock("../../windows/notifications", () => ({
  openChatInMainWindow: mocks.openChatInMainWindow,
}));

vi.mock("./preferences", () => ({
  readTrayPreferences: mocks.readTrayPreferences,
  writeTrayPreferences: mocks.writeTrayPreferences,
}));

import {
  getTrayPreferences,
  scheduleTrayRefresh,
  setTrayEnabled,
  startTray,
  stopTray,
} from "./service";

async function flushTrayRefresh() {
  await vi.advanceTimersByTimeAsync(150);
  await Promise.resolve();
  await Promise.resolve();
}

describe("tray service smoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.trayInstances.length = 0;
    mocks.activityList.mockReset();
    mocks.chatsGet.mockReset();
    mocks.openChatInMainWindow.mockReset();
    mocks.writeTrayPreferences.mockReset();
    mocks.ensureMainWindow.mockClear();
    mocks.readTrayPreferences.mockReturnValue({ enabled: true });
    mocks.activityList.mockResolvedValue({ items: [] });
    mocks.chatsGet.mockResolvedValue(null);
    stopTray();
    // Module state keeps the last enabled flag; re-arm the default for each case.
    setTrayEnabled(true);
    stopTray();
    mocks.trayInstances.length = 0;
    mocks.writeTrayPreferences.mockClear();
  });

  afterEach(() => {
    stopTray();
    vi.useRealTimers();
  });

  it("shows a needs-you badge count greater than zero", async () => {
    mocks.activityList.mockResolvedValue({
      items: [
        {
          attentionId: "a1",
          chatId: "chat-1",
          reason: "question",
          runId: "run-1",
          status: "waiting_for_you",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          attentionId: "a2",
          chatId: "chat-2",
          reason: "approval",
          runId: "run-2",
          status: "waiting_for_you",
          updatedAt: "2026-01-01T00:01:00.000Z",
        },
        {
          chatId: "chat-3",
          runId: "run-3",
          status: "running",
          updatedAt: "2026-01-01T00:02:00.000Z",
        },
      ],
    });
    mocks.chatsGet.mockImplementation(async (chatId: string) => ({
      id: chatId,
      projectId: "proj-1",
      title: `Title ${chatId}`,
    }));

    startTray();
    scheduleTrayRefresh();
    await flushTrayRefresh();

    const tray = mocks.trayInstances.at(-1);
    expect(tray).toBeDefined();
    if (process.platform === "darwin") {
      expect(tray?.setTitle).toHaveBeenCalledWith("2");
    }
    expect(tray?.setToolTip).toHaveBeenCalledWith("Angel Engine — 2 need you");
  });

  it("opens the matching session when a tray row is clicked", async () => {
    mocks.activityList.mockResolvedValue({
      items: [
        {
          attentionId: "a1",
          chatId: "chat-focus",
          reason: "question",
          runId: "run-1",
          status: "waiting_for_you",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    mocks.chatsGet.mockResolvedValue({
      id: "chat-focus",
      projectId: "proj-9",
      title: "Needs you session",
    });

    startTray();
    scheduleTrayRefresh();
    await flushTrayRefresh();

    const tray = mocks.trayInstances.at(-1);
    const menu = tray?.setContextMenu.mock.calls.at(-1)?.[0] as Array<{
      click?: () => void;
      label?: string;
    }>;
    const sessionItem = menu?.find((item) =>
      item.label?.includes("Needs you session"),
    );
    expect(sessionItem?.click).toBeTypeOf("function");
    sessionItem?.click?.();

    expect(mocks.openChatInMainWindow).toHaveBeenCalledWith(
      { id: "chat-focus", projectId: "proj-9" },
      expect.anything(),
    );
  });

  it("creates the main window when only an auxiliary window remains", async () => {
    startTray();
    scheduleTrayRefresh();
    await flushTrayRefresh();

    const tray = mocks.trayInstances.at(-1);
    const menu = tray?.setContextMenu.mock.calls.at(-1)?.[0] as Array<{
      click?: () => void;
      label?: string;
    }>;
    menu.find((item) => item.label === "tray.openApp")?.click?.();

    expect(mocks.ensureMainWindow).toHaveBeenCalledOnce();
  });

  it("removes the tray when the feature is disabled", () => {
    startTray();
    expect(mocks.trayInstances.length).toBeGreaterThan(0);
    const tray = mocks.trayInstances.at(-1);

    const next = setTrayEnabled(false);
    expect(next).toEqual({ enabled: false });
    expect(mocks.writeTrayPreferences).toHaveBeenCalledWith({ enabled: false });
    expect(tray?.destroy).toHaveBeenCalled();
    expect(getTrayPreferences()).toEqual({ enabled: false });
  });
});
