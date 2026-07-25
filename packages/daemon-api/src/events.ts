import type { ChatStreamEvent } from "./chat";
import is from "@sindresorhus/is";
import { isChatStreamEvent } from "./chat";

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

export function isDaemonGlobalEvent(
  value: unknown,
): value is DaemonGlobalEvent {
  if (!is.plainObject(value)) return false;
  switch (value.type) {
    case "chat-attention-changed":
    case "chat-metadata-changed":
      return (
        Array.isArray(value.chatIds) &&
        value.chatIds.length > 0 &&
        value.chatIds.every(
          (chatId) => typeof chatId === "string" && chatId.length > 0,
        )
      );
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
