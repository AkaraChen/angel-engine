import { describe, expect, it } from "vitest";

import {
  isDesktopNotificationHistory,
  isDesktopNotificationItem,
  readNotificationPreferencesFromConfig,
} from "./notification-preferences";

describe("notification preferences", () => {
  it("defaults OS notifications to enabled", () => {
    expect(readNotificationPreferencesFromConfig(undefined)).toEqual({
      osEnabled: true,
    });
    expect(readNotificationPreferencesFromConfig({ osEnabled: false })).toEqual(
      {
        osEnabled: false,
      },
    );
    expect(readNotificationPreferencesFromConfig({ osEnabled: true })).toEqual({
      osEnabled: true,
    });
  });
});

describe("notification history guards", () => {
  const item = {
    body: "done",
    chatId: "chat-1",
    createdAt: "2026-08-09T00:00:00.000Z",
    id: "run-1:done",
    kind: "completed" as const,
    projectId: "project-1",
    read: false,
    title: "Chat finished",
  };

  it("accepts completed, failed, and needsInput kinds", () => {
    expect(isDesktopNotificationItem(item)).toBe(true);
    expect(isDesktopNotificationItem({ ...item, kind: "failed" })).toBe(true);
    expect(isDesktopNotificationItem({ ...item, kind: "needsInput" })).toBe(
      true,
    );
    expect(isDesktopNotificationItem({ ...item, kind: "running" })).toBe(false);
    expect(isDesktopNotificationHistory({ items: [item] })).toBe(true);
  });
});
