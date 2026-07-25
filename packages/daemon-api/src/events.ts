import type { ChatStreamEvent } from "./chat";
import is from "@sindresorhus/is";
import { isChatStreamEvent } from "./chat/stream-event";

export interface DaemonChatStreamEvent {
  event: ChatStreamEvent;
  streamId: string;
  type: "chat-stream";
}

export interface DaemonChatMetadataChangedEvent {
  chatIds: string[];
  type: "chat-metadata-changed";
}

export interface DaemonChatAttentionChangedEvent {
  chatIds: string[];
  type: "chat-attention-changed";
}

export type DaemonGlobalEvent =
  | DaemonChatAttentionChangedEvent
  | DaemonChatMetadataChangedEvent
  | DaemonChatStreamEvent;

type BoundaryRecord = Record<string, unknown>;

function isBoundaryRecord(value: unknown): value is BoundaryRecord {
  return is.plainObject(value);
}

function isChatIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((chatId) => typeof chatId === "string" && chatId.length > 0)
  );
}

export function isDaemonGlobalEvent(
  value: unknown,
): value is DaemonGlobalEvent {
  if (!isBoundaryRecord(value)) return false;
  switch (value.type) {
    case "chat-attention-changed":
    case "chat-metadata-changed":
      return isChatIds(value.chatIds);
    case "chat-stream":
      return (
        typeof value.streamId === "string" &&
        value.streamId.length > 0 &&
        isChatStreamEvent(value.event)
      );
    default:
      return false;
  }
}
