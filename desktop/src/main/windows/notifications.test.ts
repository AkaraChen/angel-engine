import type { Chat } from "@angel-engine/daemon-api/chat";
import type { BrowserWindow } from "electron";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const notificationHandlers: Array<Map<string, () => void>> = [];

  return {
    clearHistory: vi.fn(() => ({ items: [] })),
    ensureMainWindow: vi.fn(),
    listHistory: vi.fn(() => ({ items: [] })),
    markRead: vi.fn(() => ({ items: [] })),
    notificationCtor: vi.fn(),
    notificationHandlers,
    readPreferences: vi.fn(() => ({ osEnabled: true })),
    recordHistory: vi.fn((input: unknown) => ({ items: [input] })),
    writePreferences: vi.fn(),
  };
});

vi.mock("electron", () => {
  class Notification {
    static isSupported = () => true;
    constructor(input: unknown) {
      mocks.notificationCtor(input);
      mocks.notificationHandlers.push(new Map());
    }
    once(event: string, handler: () => void) {
      mocks.notificationHandlers.at(-1)?.set(event, handler);
    }
    show() {}
  }

  return {
    app: { focus: vi.fn() },
    BrowserWindow: {
      fromWebContents: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
    },
    Notification,
  };
});

vi.mock("../notification-history", () => ({
  clearNotificationHistory: mocks.clearHistory,
  listNotificationHistory: mocks.listHistory,
  markNotificationHistoryRead: mocks.markRead,
  recordNotificationHistoryItem: mocks.recordHistory,
}));

vi.mock("./main-window", () => ({
  ensureMainWindow: mocks.ensureMainWindow,
}));

vi.mock("../notification-preferences", () => ({
  readNotificationPreferences: mocks.readPreferences,
  writeNotificationPreferences: mocks.writePreferences,
}));

vi.mock("../platform/i18n", () => ({
  translate: (key: string, options?: Record<string, string>) => {
    if (key === "notifications.finished") {
      return `${options?.chatTitle ?? ""} finished`;
    }
    if (key === "notifications.failed") {
      return `${options?.chatTitle ?? ""} failed`;
    }
    if (key === "notifications.needsInput") {
      return `${options?.chatTitle ?? ""} needs input`;
    }
    if (key === "notifications.needsAttention") {
      return `${options?.chatTitle ?? ""} needs attention`;
    }
    if (key === "notifications.agentFinishedNoOutput") return "no output";
    if (key === "notifications.agentFailedNoDetail") return "failed detail";
    if (key === "notifications.agentWaiting") return "waiting";
    return key;
  },
}));

const {
  getNotificationPreferences,
  notifyChatFailed,
  notifyChatNeedsInput,
  notifyChatTurnCompleted,
  setNotificationPreferences,
} = await import("./notifications");

const chat = {
  id: "chat-1",
  projectId: "project-1",
  title: "Demo chat",
} as Chat;

function backgroundWindow(isDestroyed = () => false, send = vi.fn()) {
  return {
    isDestroyed,
    isMinimized: () => true,
    isVisible: () => false,
    on: () => undefined,
    webContents: { send },
  } as unknown as BrowserWindow;
}

function mainWindow(send = vi.fn()) {
  return {
    focus: vi.fn(),
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    restore: vi.fn(),
    show: vi.fn(),
    webContents: { send },
  };
}

describe("desktop notifications", () => {
  beforeEach(() => {
    mocks.ensureMainWindow.mockReset();
    mocks.ensureMainWindow.mockReturnValue(mainWindow());
    mocks.notificationCtor.mockClear();
    mocks.notificationHandlers.length = 0;
    mocks.recordHistory.mockClear();
    mocks.writePreferences.mockClear();
    mocks.readPreferences.mockReturnValue({ osEnabled: true });
    setNotificationPreferences({ osEnabled: true });
  });

  it("records completed, needsInput, and failed history entries", () => {
    const window = backgroundWindow();

    notifyChatTurnCompleted({
      attentionId: "run-1:done",
      body: "All good",
      chat,
      window,
    });
    notifyChatNeedsInput({
      attentionId: "run-2:input:e1",
      chat,
      elicitation: {
        body: "Continue?",
        id: "e1",
        kind: "approval",
        phase: "open",
        title: "Permission",
      },
      window,
    });
    notifyChatFailed({
      attentionId: "run-3:failed",
      body: "Provider failed",
      chat,
      window,
    });

    expect(mocks.recordHistory).toHaveBeenCalledTimes(3);
    expect(
      mocks.recordHistory.mock.calls.map(
        (call) => (call[0] as { kind: string }).kind,
      ),
    ).toEqual(["completed", "needsInput", "failed"]);
    expect(mocks.notificationCtor).toHaveBeenCalledTimes(3);
  });

  it("keeps history when OS notifications are disabled", () => {
    setNotificationPreferences({ osEnabled: false });
    const window = backgroundWindow();

    notifyChatFailed({
      attentionId: "run-4:failed",
      body: "boom",
      chat,
      window,
    });

    expect(mocks.recordHistory).toHaveBeenCalledTimes(1);
    expect(mocks.notificationCtor).not.toHaveBeenCalled();
    expect(getNotificationPreferences()).toEqual({ osEnabled: false });
    expect(mocks.writePreferences).toHaveBeenCalledWith({ osEnabled: false });
  });

  it("opens a new main window instead of navigating the auxiliary host", () => {
    const auxiliarySend = vi.fn();
    const mainSend = vi.fn();
    const auxiliary = backgroundWindow(() => false, auxiliarySend);
    const main = mainWindow(mainSend);
    mocks.ensureMainWindow.mockReturnValue(main);

    notifyChatTurnCompleted({
      attentionId: "run-5:done",
      body: "All good",
      chat,
      window: auxiliary,
    });
    mocks.notificationHandlers.at(-1)?.get("click")?.();

    expect(mocks.ensureMainWindow).toHaveBeenCalledOnce();
    expect(auxiliarySend).not.toHaveBeenCalled();
    expect(mainSend).toHaveBeenCalledWith(
      "desktop-window:notification:open-chat",
      { chatId: "chat-1", projectId: "project-1" },
    );
  });

  it("resolves the main window again when the notification is clicked", () => {
    let destroyed = false;
    const originalSend = vi.fn();
    const replacementSend = vi.fn();
    const originalMain = backgroundWindow(() => destroyed, originalSend);
    const replacementMain = mainWindow(replacementSend);

    notifyChatTurnCompleted({
      attentionId: "run-6:done",
      body: "All good",
      chat,
      window: originalMain,
    });
    destroyed = true;
    mocks.ensureMainWindow.mockReturnValue(replacementMain);
    mocks.notificationHandlers.at(-1)?.get("click")?.();

    expect(mocks.ensureMainWindow).toHaveBeenCalledOnce();
    expect(originalSend).not.toHaveBeenCalled();
    expect(replacementSend).toHaveBeenCalledOnce();
  });
});
