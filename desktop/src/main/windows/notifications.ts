import type { Chat, ChatElicitation } from "@angel-engine/daemon-api/chat";
import type {
  DesktopNotificationKind,
  DesktopNotificationPreferences,
} from "../../shared/notification-preferences";

import type { DesktopOpenChatFromNotificationEvent } from "../../shared/desktop-window";
import is from "@sindresorhus/is";
import { app, BrowserWindow, ipcMain, Notification } from "electron";
import {
  DESKTOP_ACTIVE_CHAT_SET_CHANNEL,
  DESKTOP_NOTIFICATION_HISTORY_CLEAR_CHANNEL,
  DESKTOP_NOTIFICATION_HISTORY_GET_CHANNEL,
  DESKTOP_NOTIFICATION_HISTORY_MARK_READ_CHANNEL,
  DESKTOP_NOTIFICATION_PREFERENCES_GET_CHANNEL,
  DESKTOP_NOTIFICATION_PREFERENCES_SET_CHANNEL,
  DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
} from "../../shared/desktop-window";
import {
  clearNotificationHistory,
  listNotificationHistory,
  markNotificationHistoryRead,
  recordNotificationHistoryItem,
} from "../notification-history";
import {
  readNotificationPreferences,
  writeNotificationPreferences,
} from "../notification-preferences";
import { translate } from "../platform/i18n";
import { ensureMainWindow } from "./main-window";

interface WindowNotificationState {
  activeChatId: string | null;
  backgrounded: boolean;
  hiddenActiveChatId: string | null;
}

const windowStates = new WeakMap<BrowserWindow, WindowNotificationState>();
const retainedNotifications = new Set<Notification>();
let didRegisterIpc = false;
let preferences: DesktopNotificationPreferences | undefined;

export function registerDesktopWindowIpc() {
  if (didRegisterIpc) return;
  didRegisterIpc = true;
  preferences = readNotificationPreferences();

  ipcMain.on(DESKTOP_ACTIVE_CHAT_SET_CHANNEL, (event, chatId: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const state = stateForWindow(window);
    state.activeChatId = typeof chatId === "string" && chatId ? chatId : null;
  });

  ipcMain.handle(DESKTOP_NOTIFICATION_PREFERENCES_GET_CHANNEL, () =>
    getNotificationPreferences(),
  );

  ipcMain.handle(
    DESKTOP_NOTIFICATION_PREFERENCES_SET_CHANNEL,
    (_event, input: unknown) => setNotificationPreferences(input),
  );

  ipcMain.handle(DESKTOP_NOTIFICATION_HISTORY_GET_CHANNEL, () =>
    listNotificationHistory(),
  );

  ipcMain.handle(DESKTOP_NOTIFICATION_HISTORY_CLEAR_CHANNEL, () =>
    clearNotificationHistory(),
  );

  ipcMain.handle(
    DESKTOP_NOTIFICATION_HISTORY_MARK_READ_CHANNEL,
    (_event, input: unknown) => {
      const ids = readHistoryIds(input);
      return markNotificationHistoryRead(ids);
    },
  );
}

export function getNotificationPreferences(): DesktopNotificationPreferences {
  return { ...currentPreferences() };
}

export function setNotificationPreferences(
  input: unknown,
): DesktopNotificationPreferences {
  const osEnabled =
    is.plainObject(input) && input.osEnabled === false ? false : true;
  preferences = { osEnabled };
  writeNotificationPreferences(preferences);
  return { ...preferences };
}

function currentPreferences(): DesktopNotificationPreferences {
  preferences ??= readNotificationPreferences();
  return preferences;
}

export function configureDesktopWindowNotifications(window: BrowserWindow) {
  stateForWindow(window);

  window.on("hide", () => markWindowBackgrounded(window));
  window.on("minimize", () => markWindowBackgrounded(window));
  window.on("show", () => markWindowVisible(window));
  window.on("restore", () => markWindowVisible(window));
  window.on("closed", () => {
    windowStates.delete(window);
  });
}

export function notifyChatTurnCompleted(input: {
  attentionId: string;
  body: string;
  chat: Chat;
  window?: BrowserWindow | null;
}) {
  const title = translate("notifications.finished", {
    chatTitle: notificationChatTitle(input.chat),
  });
  const body = notificationBody(
    input.body,
    translate("notifications.agentFinishedNoOutput"),
  );
  deliverChatNotification({
    attentionId: input.attentionId,
    body,
    chat: input.chat,
    kind: "completed",
    title,
    window: input.window,
  });
}

export function notifyChatFailed(input: {
  attentionId: string;
  body: string;
  chat: Chat;
  window?: BrowserWindow | null;
}) {
  const title = translate("notifications.failed", {
    chatTitle: notificationChatTitle(input.chat),
  });
  const body = notificationBody(
    input.body,
    translate("notifications.agentFailedNoDetail"),
  );
  deliverChatNotification({
    attentionId: input.attentionId,
    body,
    chat: input.chat,
    kind: "failed",
    title,
    window: input.window,
  });
}

export function notifyChatNeedsInput(input: {
  attentionId: string;
  chat: Chat;
  elicitation: ChatElicitation;
  window?: BrowserWindow | null;
}) {
  const title = is.nonEmptyString(input.elicitation.title)
    ? translate("notifications.needsInput", {
        chatTitle: notificationChatTitle(input.chat),
      })
    : translate("notifications.needsAttention", {
        chatTitle: notificationChatTitle(input.chat),
      });
  const body =
    [
      input.elicitation.body,
      input.elicitation.title,
      input.elicitation.questions
        ?.map((question: { question?: string }) => question.question)
        .find(is.nonEmptyString),
    ].find(is.nonEmptyString) ?? translate("notifications.agentWaiting");

  deliverChatNotification({
    attentionId: input.attentionId,
    body: notificationBody(body, translate("notifications.agentWaiting")),
    chat: input.chat,
    kind: "needsInput",
    title,
    window: input.window,
  });
}

function deliverChatNotification(input: {
  attentionId: string;
  body: string;
  chat: Chat;
  kind: DesktopNotificationKind;
  title: string;
  window?: BrowserWindow | null;
}) {
  recordNotificationHistoryItem({
    body: input.body,
    chatId: input.chat.id,
    id: input.attentionId,
    kind: input.kind,
    projectId: input.chat.projectId,
    title: input.title,
  });

  showBackgroundChatNotification({
    body: input.body,
    chat: input.chat,
    title: input.title,
    window: input.window,
  });
}

function showBackgroundChatNotification(input: {
  body: string;
  chat: Chat;
  title: string;
  window?: BrowserWindow | null;
}) {
  if (!currentPreferences().osEnabled) return;

  const window = input.window;
  if (!window || window.isDestroyed() || !isWindowBackgrounded(window)) {
    return;
  }
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    body: input.body,
    silent: false,
    title: input.title,
  });
  retainedNotifications.add(notification);
  notification.once("click", () => {
    retainedNotifications.delete(notification);
    openChatInMainWindow(input.chat);
  });
  notification.once("close", () => {
    retainedNotifications.delete(notification);
  });
  notification.show();
}

/**
 * Focus the desktop shell and open a chat. Used by OS notifications and the
 * menu-bar tray so both paths share the same navigation contract.
 */
export function openChatInMainWindow(
  chat: Pick<Chat, "id" | "projectId">,
  window: BrowserWindow = ensureMainWindow(),
) {
  if (window.isDestroyed()) return;

  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
  app.focus({ steal: true });

  const payload: DesktopOpenChatFromNotificationEvent = {
    chatId: chat.id,
    projectId: chat.projectId,
  };
  window.webContents.send(DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL, payload);
}

function markWindowBackgrounded(window: BrowserWindow) {
  const state = stateForWindow(window);
  state.backgrounded = true;
  state.hiddenActiveChatId = state.activeChatId;
}

function markWindowVisible(window: BrowserWindow) {
  const state = stateForWindow(window);
  state.backgrounded = false;
  state.hiddenActiveChatId = null;
}

function isWindowBackgrounded(window: BrowserWindow) {
  const state = stateForWindow(window);
  return state.backgrounded || window.isMinimized() || !window.isVisible();
}

function stateForWindow(window: BrowserWindow) {
  const existing = windowStates.get(window);
  if (existing) return existing;

  const state: WindowNotificationState = {
    activeChatId: null,
    backgrounded: window.isMinimized() || !window.isVisible(),
    hiddenActiveChatId: null,
  };
  windowStates.set(window, state);
  return state;
}

function notificationChatTitle(chat: Chat) {
  const title = chat.title.trim();
  if (is.nonEmptyString(title)) return title;
  return "Angel Engine";
}

function notificationBody(text: string | null | undefined, fallback: string) {
  const normalizedText = text?.replace(/\s+/g, " ").trim();
  const normalized = is.nonEmptyString(normalizedText)
    ? normalizedText
    : fallback;
  return normalized.length > 220
    ? `${normalized.slice(0, 217).trimEnd()}...`
    : normalized;
}

function readHistoryIds(input: unknown): string[] {
  if (!is.plainObject(input) || !Array.isArray(input.ids)) return [];
  return input.ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}
