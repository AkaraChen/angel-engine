import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isDesktopNotificationHistory,
  isDesktopNotificationItem,
  mergeNotificationPreferences,
  readNotificationPreferencesFromConfig,
  shouldShowOsNotification,
} from "./notification-preferences";

describe("notification preferences", () => {
  it("defaults all OS notification categories and sound to enabled", () => {
    expect(readNotificationPreferencesFromConfig(undefined)).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    expect(readNotificationPreferencesFromConfig({ osEnabled: false })).toEqual(
      {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        osEnabled: false,
      },
    );
    expect(readNotificationPreferencesFromConfig({ osEnabled: true })).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
  });

  it("migrates legacy osEnabled-only config without changing child defaults", () => {
    expect(
      readNotificationPreferencesFromConfig({ osEnabled: true }),
    ).toMatchObject({
      needsInput: true,
      osEnabled: true,
      runCompleted: true,
      runFailed: true,
      sound: true,
    });
  });

  it("merges partial updates without resetting child choices", () => {
    const mutedChildren = mergeNotificationPreferences(
      DEFAULT_NOTIFICATION_PREFERENCES,
      { needsInput: false, runCompleted: false, sound: false },
    );
    expect(mutedChildren).toMatchObject({
      needsInput: false,
      osEnabled: true,
      runCompleted: false,
      runFailed: true,
      sound: false,
    });

    const masterOff = mergeNotificationPreferences(mutedChildren, {
      osEnabled: false,
    });
    expect(masterOff).toMatchObject({
      needsInput: false,
      osEnabled: false,
      runCompleted: false,
      runFailed: true,
      sound: false,
    });

    const masterOn = mergeNotificationPreferences(masterOff, {
      osEnabled: true,
    });
    expect(masterOn).toMatchObject({
      needsInput: false,
      osEnabled: true,
      runCompleted: false,
      sound: false,
    });
  });

  it("gates OS construction by master and category", () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      needsInput: false,
      runCompleted: true,
      runFailed: false,
    };
    expect(shouldShowOsNotification(prefs, "completed")).toBe(true);
    expect(shouldShowOsNotification(prefs, "needsInput")).toBe(false);
    expect(shouldShowOsNotification(prefs, "failed")).toBe(false);
    expect(
      shouldShowOsNotification({ ...prefs, osEnabled: false }, "completed"),
    ).toBe(false);
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
