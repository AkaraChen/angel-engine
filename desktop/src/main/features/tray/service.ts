import type { ChatActivity } from "@angel-engine/daemon-api/chat";
import type { MenuItemConstructorOptions } from "electron";

import fs from "node:fs";
import path from "node:path";
import is from "@sindresorhus/is";
import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";
import log from "electron-log/main";
import type { DesktopTrayPreferences } from "../../../shared/tray";
import { daemonClient } from "../../daemon/client";
import { translate } from "../../platform/i18n";
import { createMainWindow } from "../../windows/main-window";
import { openChatInMainWindow } from "../../windows/notifications";
import {
  countNeedsYou,
  fleetStatusI18nKey,
  selectTrayActivities,
  sortTraySessions,
  trayBadgeLabel,
  type TraySessionItem,
} from "./model";
import { readTrayPreferences, writeTrayPreferences } from "./preferences";

let tray: Tray | undefined;
let preferences: DesktopTrayPreferences | undefined;
let refreshQueue: Promise<void> = Promise.resolve();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let lastNeedsYouCount = 0;

function currentPreferences(): DesktopTrayPreferences {
  preferences ??= readTrayPreferences();
  return preferences;
}

export function startTray() {
  applyTrayEnabled(currentPreferences().enabled);
}

export function stopTray() {
  if (refreshTimer !== undefined) {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
  destroyTray();
}

export function getTrayPreferences(): DesktopTrayPreferences {
  return { ...currentPreferences() };
}

export function setTrayEnabled(enabled: boolean): DesktopTrayPreferences {
  const current = currentPreferences();
  if (current.enabled === enabled) return getTrayPreferences();
  preferences = { enabled };
  writeTrayPreferences(preferences);
  applyTrayEnabled(enabled);
  return getTrayPreferences();
}

/** Rebuild badge + menu after fleet activity changes or language updates. */
export function scheduleTrayRefresh() {
  if (!currentPreferences().enabled) return;
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    refreshQueue = refreshQueue
      .then(() => refreshTray().catch((error: unknown) => {
        log.warn("Could not refresh the menu bar tray.", error);
      }))
      .then(() => undefined);
  }, 120);
}

function applyTrayEnabled(enabled: boolean) {
  if (!enabled) {
    destroyTray();
    return;
  }
  ensureTray();
  scheduleTrayRefresh();
}

function ensureTray() {
  if (tray !== undefined) return;

  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip(translate("tray.tooltip"));
  tray.setIgnoreDoubleClickEvents(true);
  tray.on("click", () => {
    // Windows/Linux: left-click opens the menu; also focus the app when empty.
    if (process.platform === "darwin") return;
    if (lastNeedsYouCount === 0) {
      showMainWindow();
    }
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        enabled: false,
        label: translate("tray.empty"),
      },
      { type: "separator" },
      openAppMenuItem(),
      disableMenuItem(),
    ]),
  );
}

function destroyTray() {
  tray?.destroy();
  tray = undefined;
  lastNeedsYouCount = 0;
}

async function refreshTray() {
  if (!currentPreferences().enabled) return;
  ensureTray();
  if (tray === undefined) return;

  let activities: ChatActivity[] = [];
  try {
    const result = await daemonClient.activity.list();
    activities = result.items;
  } catch {
    activities = [];
  }

  const needsYou = countNeedsYou(activities);
  lastNeedsYouCount = needsYou;
  const badge = trayBadgeLabel(needsYou);

  if (process.platform === "darwin") {
    tray.setTitle(badge);
  }
  tray.setToolTip(
    needsYou > 0
      ? translate("tray.tooltipNeedsYou", { count: needsYou })
      : translate("tray.tooltip"),
  );

  const selected = selectTrayActivities(activities);
  const sessions = sortTraySessions(await resolveSessionItems(selected));
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(sessions, needsYou)));
}

async function resolveSessionItems(
  activities: ChatActivity[],
): Promise<TraySessionItem[]> {
  const items: TraySessionItem[] = [];
  for (const activity of activities) {
    try {
      const chat = await daemonClient.chats.get(activity.chatId);
      if (chat === null) continue;
      items.push({
        chatId: chat.id,
        projectId: chat.projectId,
        status: activity.status,
        title: sessionTitle(chat.title),
      });
    } catch {
      items.push({
        chatId: activity.chatId,
        projectId: null,
        status: activity.status,
        title: sessionTitle(undefined),
      });
    }
  }
  return items;
}

function buildMenuTemplate(
  sessions: TraySessionItem[],
  needsYou: number,
): MenuItemConstructorOptions[] {
  const header: MenuItemConstructorOptions = {
    enabled: false,
    label:
      needsYou > 0
        ? translate("tray.needsYouCount", { count: needsYou })
        : translate("tray.empty"),
  };

  const sessionItems: MenuItemConstructorOptions[] =
    sessions.length === 0
      ? []
      : sessions.map((session) => ({
          click: () => {
            focusChatFromTray({
              id: session.chatId,
              projectId: session.projectId,
            });
          },
          label: sessionMenuLabel(session),
        }));

  return [
    header,
    ...(sessionItems.length > 0
      ? [{ type: "separator" } as const, ...sessionItems]
      : []),
    { type: "separator" },
    openAppMenuItem(),
    disableMenuItem(),
  ];
}

function sessionMenuLabel(session: TraySessionItem) {
  const status = translate(fleetStatusI18nKey(session.status));
  return `${session.title} — ${status}`;
}

function sessionTitle(title: string | null | undefined) {
  const normalized = title?.trim();
  return is.nonEmptyString(normalized) ? normalized : "Angel Engine";
}

function openAppMenuItem(): MenuItemConstructorOptions {
  return {
    click: () => showMainWindow(),
    label: translate("tray.openApp"),
  };
}

function disableMenuItem(): MenuItemConstructorOptions {
  return {
    click: () => {
      setTrayEnabled(false);
    },
    label: translate("tray.disable"),
  };
}

function showMainWindow() {
  const window = ensureMainWindow();
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
  app.focus({ steal: true });
  return window;
}

function focusChatFromTray(chat: { id: string; projectId: string | null }) {
  const window = showMainWindow();
  openChatInMainWindow(chat, window);
}

function ensureMainWindow() {
  const existing = BrowserWindow.getAllWindows().find(
    (window) => !window.isDestroyed(),
  );
  if (existing) return existing;
  return createMainWindow();
}

function loadTrayIcon() {
  for (const candidate of trayIconCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const image = nativeImage.createFromPath(candidate);
      if (image.isEmpty()) continue;
      // Menu bar icons stay small; resize when the asset is a full app icon.
      if (image.getSize().width > 22) {
        return image.resize({ height: 18, width: 18 });
      }
      return image;
    } catch {
      // try next candidate
    }
  }

  // Empty 16×16 image keeps Tray constructible when assets are missing in tests.
  return nativeImage.createEmpty();
}

function trayIconCandidates() {
  const names = [
    path.join("assets", "linux-icons", "16x16.png"),
    path.join("assets", "linux-icons", "32x32.png"),
    path.join("assets", "icon.png"),
  ];
  const roots = [
    app.getAppPath(),
    path.resolve(app.getAppPath(), ".."),
    path.resolve(app.getAppPath(), "..", ".."),
    process.resourcesPath,
  ];
  return roots.flatMap((root) => names.map((name) => path.join(root, name)));
}
