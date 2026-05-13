import { app, BrowserWindow, ipcMain, Notification } from "electron";

import type { Chat, ChatElicitation } from "../shared/chat";
import {
  DESKTOP_ACTIVE_CHAT_SET_CHANNEL,
  DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
  type DesktopOpenChatFromNotificationEvent,
} from "../shared/desktop-window";

type WindowNotificationState = {
  activeChatId: string | null;
  backgrounded: boolean;
  hiddenActiveChatId: string | null;
};

const windowStates = new WeakMap<BrowserWindow, WindowNotificationState>();
const retainedNotifications = new Set<Notification>();

export function registerDesktopWindowIpc() {
  ipcMain.on(DESKTOP_ACTIVE_CHAT_SET_CHANNEL, (event, chatId: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    const state = stateForWindow(window);
    state.activeChatId = typeof chatId === "string" && chatId ? chatId : null;
  });
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
  body: string;
  chat: Chat;
  window?: BrowserWindow | null;
}) {
  showBackgroundChatNotification({
    body: notificationBody(
      input.body,
      "The agent finished without text output.",
    ),
    chat: input.chat,
    title: `${notificationChatTitle(input.chat)} finished`,
    window: input.window,
  });
}

export function notifyChatNeedsInput(input: {
  chat: Chat;
  elicitation: ChatElicitation;
  window?: BrowserWindow | null;
}) {
  const title = input.elicitation.title
    ? `${notificationChatTitle(input.chat)} needs input`
    : `${notificationChatTitle(input.chat)} needs attention`;
  const body =
    input.elicitation.body ||
    input.elicitation.title ||
    input.elicitation.questions
      ?.map((question) => question.question)
      .find(Boolean) ||
    "The agent is waiting for a response.";

  showBackgroundChatNotification({
    body: notificationBody(body, "The agent is waiting for a response."),
    chat: input.chat,
    title,
    window: input.window,
  });
}

function showBackgroundChatNotification(input: {
  body: string;
  chat: Chat;
  title: string;
  window?: BrowserWindow | null;
}) {
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
    openChatFromNotification(window, input.chat);
  });
  notification.once("close", () => {
    retainedNotifications.delete(notification);
  });
  notification.show();
}

function openChatFromNotification(window: BrowserWindow, chat: Chat) {
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
  return chat.title.trim() || "Angel Engine";
}

function notificationBody(text: string | null | undefined, fallback: string) {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim() || fallback;
  return normalized.length > 220
    ? `${normalized.slice(0, 217).trimEnd()}...`
    : normalized;
}
