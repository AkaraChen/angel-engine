import type {
  DesktopNotificationHistory,
  DesktopNotificationItem,
  DesktopNotificationKind,
} from "../shared/notification-preferences";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import is from "@sindresorhus/is";
import { app, BrowserWindow } from "electron";
import log from "electron-log/main";

import { DESKTOP_NOTIFICATION_HISTORY_CHANGED_CHANNEL } from "../shared/desktop-window";
import { isDesktopNotificationItem } from "../shared/notification-preferences";

const MAX_HISTORY_ITEMS = 100;

function historyPath() {
  return path.join(app.getPath("userData"), "notification-history.json");
}

let cached: DesktopNotificationItem[] | undefined;

export function listNotificationHistory(): DesktopNotificationHistory {
  return { items: [...loadHistory()] };
}

export function recordNotificationHistoryItem(input: {
  body: string;
  chatId: string;
  id: string;
  kind: DesktopNotificationKind;
  projectId?: string | null;
  title: string;
}): DesktopNotificationHistory {
  const items = loadHistory().filter((item) => item.id !== input.id);
  const next: DesktopNotificationItem = {
    body: input.body,
    chatId: input.chatId,
    createdAt: new Date().toISOString(),
    id: input.id,
    kind: input.kind,
    projectId: input.projectId,
    read: false,
    title: input.title,
  };
  items.unshift(next);
  const trimmed = items.slice(0, MAX_HISTORY_ITEMS);
  persist(trimmed);
  broadcast(trimmed);
  return { items: [...trimmed] };
}

export function markNotificationHistoryRead(
  ids: readonly string[],
): DesktopNotificationHistory {
  if (ids.length === 0) return listNotificationHistory();
  const idSet = new Set(ids);
  const items = loadHistory().map((item) =>
    idSet.has(item.id) ? { ...item, read: true } : item,
  );
  persist(items);
  broadcast(items);
  return { items: [...items] };
}

export function clearNotificationHistory(): DesktopNotificationHistory {
  persist([]);
  broadcast([]);
  return { items: [] };
}

function loadHistory(): DesktopNotificationItem[] {
  if (cached !== undefined) return cached;
  try {
    const parsed: unknown = JSON.parse(readFileSync(historyPath(), "utf8"));
    const items = Array.isArray(parsed)
      ? parsed
      : is.plainObject(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : [];
    cached = items
      .filter(isDesktopNotificationItem)
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    cached = [];
  }
  return cached;
}

function persist(items: DesktopNotificationItem[]) {
  cached = items;
  try {
    writeFileSync(historyPath(), `${JSON.stringify({ items })}\n`);
  } catch (error: unknown) {
    log.warn("Could not persist notification history.", error);
  }
}

function broadcast(items: DesktopNotificationItem[]) {
  const payload: DesktopNotificationHistory = { items };
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(
      DESKTOP_NOTIFICATION_HISTORY_CHANGED_CHANNEL,
      payload,
    );
  }
}
