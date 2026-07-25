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

export interface DaemonChatRunEvent {
  chatId: string;
  event: ChatStreamEvent;
  runId: string;
  sequence: number;
  type: "chat-run";
}

export type DaemonGlobalEvent =
  | DaemonChatMetadataChangedEvent
  | DaemonChatRunEvent
  | DaemonChatStreamEvent;

export function isDaemonGlobalEvent(
  value: unknown,
): value is DaemonGlobalEvent {
  if (!is.plainObject(value)) return false;
  switch (value.type) {
    case "chat-metadata-changed":
      return (
        Array.isArray(value.chatIds) &&
        value.chatIds.every(
          (chatId) => typeof chatId === "string" && chatId.length > 0,
        )
      );
    case "chat-run":
      return (
        typeof value.chatId === "string" &&
        value.chatId.length > 0 &&
        typeof value.runId === "string" &&
        value.runId.length > 0 &&
        typeof value.sequence === "number" &&
        Number.isSafeInteger(value.sequence) &&
        value.sequence > 0 &&
        isChatStreamEvent(value.event)
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
