import type { Chat } from "@angel-engine/daemon-api/chat";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearHistory: vi.fn(() => ({ items: [] })),
  listHistory: vi.fn(() => ({ items: [] })),
  markRead: vi.fn(() => ({ items: [] })),
  notificationCtor: vi.fn(),
  readPreferences: vi.fn(() => ({
    needsInput: true,
    osEnabled: true,
    runCompleted: true,
    runFailed: true,
    sound: true,
    version: 1 as const,
  })),
  recordHistory: vi.fn((input: unknown) => ({ items: [input] })),
  writePreferences: vi.fn(),
}));

vi.mock("electron", () => {
  class Notification {
    static isSupported = () => true;
    constructor(input: unknown) {
      mocks.notificationCtor(input);
    }
    once() {}
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

function backgroundWindow() {
  return {
    isDestroyed: () => false,
    isMinimized: () => true,
    isVisible: () => false,
    on: () => undefined,
    webContents: { send: vi.fn() },
  } as never;
}

describe("desktop notifications", () => {
  beforeEach(() => {
    mocks.notificationCtor.mockClear();
    mocks.recordHistory.mockClear();
    mocks.writePreferences.mockClear();
    mocks.readPreferences.mockReturnValue({
      needsInput: true,
      osEnabled: true,
      runCompleted: true,
      runFailed: true,
      sound: true,
      version: 1,
    });
    setNotificationPreferences({
      needsInput: true,
      osEnabled: true,
      runCompleted: true,
      runFailed: true,
      sound: true,
    });
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
    expect(getNotificationPreferences().osEnabled).toBe(false);
    expect(mocks.writePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ osEnabled: false }),
    );
  });

  it("honors category and sound preferences when constructing OS banners", () => {
    setNotificationPreferences({
      needsInput: false,
      osEnabled: true,
      runCompleted: true,
      runFailed: false,
      sound: false,
    });
    const window = backgroundWindow();

    notifyChatTurnCompleted({
      attentionId: "run-5:done",
      body: "ok",
      chat,
      window,
    });
    notifyChatNeedsInput({
      attentionId: "run-6:input:e1",
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
      attentionId: "run-7:failed",
      body: "boom",
      chat,
      window,
    });

    expect(mocks.recordHistory).toHaveBeenCalledTimes(3);
    expect(mocks.notificationCtor).toHaveBeenCalledTimes(1);
    expect(mocks.notificationCtor).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true }),
    );
  });
});
