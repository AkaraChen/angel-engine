import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import type {
  Chat,
  ChatElicitation,
  ChatToolAction,
} from "@angel-engine/daemon-api/chat";
import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";

import { BrowserWindow } from "electron";
import { translate } from "../platform/i18n";
import {
  notifyChatNeedsInput,
  notifyChatTurnCompleted,
} from "../windows/notifications";
import { subscribeDaemonConnection } from "./supervisor";

interface StreamState {
  chat?: Chat;
  notified: Set<string>;
}

let socket: WebSocket | undefined;
let unsubscribe: (() => void) | undefined;
const streams = new Map<string, StreamState>();

export function startDaemonEvents() {
  unsubscribe = subscribeDaemonConnection((connection) => {
    socket?.close();
    socket = undefined;
    if (connection.status !== "available") return;
    connect(connection.info);
  });
}

function connect(info: DaemonInfo) {
  const next = new WebSocket(
    `ws://${info.host}:${info.port}/api/events`,
    `angel-engine-token.${info.token}`,
  );
  socket = next;
  next.addEventListener("message", (message) => {
    handleEvent(JSON.parse(String(message.data)) as DaemonGlobalEvent);
  });
  next.addEventListener("close", () => {
    if (socket !== next) return;
    socket = undefined;
    setTimeout(() => {
      if (socket === undefined) connect(info);
    }, 1_000);
  });
}

export function stopDaemonEvents() {
  unsubscribe?.();
  unsubscribe = undefined;
  socket?.close();
  socket = undefined;
  streams.clear();
}

function handleEvent(message: DaemonGlobalEvent) {
  if (message.type !== "chat-stream") return;
  const state = streams.get(message.streamId) ?? {
    notified: new Set<string>(),
  };
  streams.set(message.streamId, state);
  const event = message.event;
  if (event.type === "chat") state.chat = event.chat;
  else if (event.type === "result") {
    state.chat = event.result.chat;
    notifyChatTurnCompleted({
      body: event.result.text,
      chat: event.result.chat,
      window: notificationWindow(),
    });
  } else if (event.type === "elicitation")
    notifyElicitation(state, event.elicitation);
  else if (event.type === "tool") notifyTool(state, event.action);
  else if (event.type === "done") streams.delete(message.streamId);
}

function notifyTool(state: StreamState, action: ChatToolAction) {
  if (action.phase !== "awaitingDecision") return;
  notifyElicitation(state, {
    body: action.inputSummary ?? action.rawInput ?? null,
    id: action.id,
    kind: "approval",
    phase: "open",
    title: action.title ?? translate("notifications.permissionRequired"),
  });
}

function notifyElicitation(state: StreamState, elicitation: ChatElicitation) {
  if (
    elicitation.phase !== "open" ||
    state.notified.has(elicitation.id) ||
    state.chat === undefined
  )
    return;
  state.notified.add(elicitation.id);
  notifyChatNeedsInput({
    chat: state.chat,
    elicitation,
    window: notificationWindow(),
  });
}

function notificationWindow() {
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
}
