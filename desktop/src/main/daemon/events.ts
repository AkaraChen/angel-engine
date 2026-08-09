import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import type {
  ChatActivity,
  ChatAttention,
  ChatHistoryMessage,
} from "@angel-engine/daemon-api/chat";
import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";

import { chatPartsText } from "@angel-engine/daemon-api/chat";
import is from "@sindresorhus/is";
import { BrowserWindow } from "electron";
import {
  notifyChatFailed,
  notifyChatNeedsInput,
  notifyChatTurnCompleted,
} from "../windows/notifications";
import { daemonClient } from "./client";
import { subscribeDaemonConnection } from "./supervisor";

let socket: WebSocket | undefined;
let unsubscribe: (() => void) | undefined;

/**
 * Attention ids already turned into a notification. The id is
 * `<runId>:input:<elicitationId>`, `<runId>:done`, or `<runId>:failed`, so it
 * survives the run leaving the daemon registry and dedupes per event rather
 * than per chat.
 */
const notified = new Set<string>();

/** Attention reads are serialized so overlapping events cannot interleave. */
let queue: Promise<void> = Promise.resolve();

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
  notified.clear();
}

/**
 * `chat-attention-changed` is a hint, not a verdict: the daemon publishes it on
 * clears too, so the authoritative status always comes from a pull. The main
 * process no longer mirrors run events of its own.
 */
function handleEvent(message: DaemonGlobalEvent) {
  if (message.type !== "chat-attention-changed") return;
  const chatIds = new Set(message.chatIds);
  queue = queue.then(() =>
    notifyChangedAttention(chatIds).catch((): undefined => undefined),
  );
}

async function notifyChangedAttention(chatIds: Set<string>) {
  const { attentions } = await daemonClient.attention.list();
  const live = new Set(attentions.map((attention) => attention.id));
  for (const id of notified) {
    if (!live.has(id)) notified.delete(id);
  }

  // A chat with no row was cleared — acknowledged, answered, or cancelled.
  // Nothing to show, and specifically never a completion.
  for (const attention of attentions) {
    if (!chatIds.has(attention.chatId)) continue;
    if (notified.has(attention.id)) continue;
    notified.add(attention.id);
    await notifyAttention(attention);
  }
}

async function notifyAttention(attention: ChatAttention) {
  if (attention.status === "needsInput") {
    const { run } = await daemonClient.chatRuns.active(attention.chatId);
    // The run may have been answered or cancelled between event and read.
    if (run === null || run.status !== "needsInput") return;
    const chat = await daemonClient.chats.get(attention.chatId);
    if (chat === null) return;
    notifyChatNeedsInput({
      attentionId: attention.id,
      chat,
      elicitation: run.pendingElicitation,
      window: notificationWindow(),
    });
    return;
  }

  if (attention.status === "failed") {
    const [{ items }, chat] = await Promise.all([
      daemonClient.activity.list(),
      daemonClient.chats.get(attention.chatId),
    ]);
    if (chat === null) return;
    const activity = items.find(
      (
        item: ChatActivity,
      ): item is Extract<ChatActivity, { status: "failed" }> =>
        item.status === "failed" && item.attentionId === attention.id,
    );
    const body =
      activity !== undefined && is.nonEmptyString(activity.failure.message)
        ? activity.failure.message
        : "";
    notifyChatFailed({
      attentionId: attention.id,
      body,
      chat,
      window: notificationWindow(),
    });
    return;
  }

  // A completed run has left the registry, so there is no `result.text`; the
  // body comes from the chat's canonical history instead.
  const loaded = await daemonClient.chats.load(attention.chatId);
  notifyChatTurnCompleted({
    attentionId: attention.id,
    body: lastAssistantText(loaded.messages),
    chat: loaded.chat,
    window: notificationWindow(),
  });
}

function lastAssistantText(messages: ChatHistoryMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") {
      return chatPartsText(message.content, "text");
    }
  }
  return "";
}

function notificationWindow() {
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
}
