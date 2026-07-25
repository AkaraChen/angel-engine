import is from "@sindresorhus/is";

export interface DaemonChatMetadataChangedEvent {
  chatIds: string[];
  type: "chat-metadata-changed";
}

export interface DaemonChatAttentionChangedEvent {
  chatIds: string[];
  type: "chat-attention-changed";
}

export interface DaemonChatActivityChangedEvent {
  chatIds: string[];
  type: "chat-activity-changed";
}

export type DaemonGlobalEvent =
  | DaemonChatActivityChangedEvent
  | DaemonChatAttentionChangedEvent
  | DaemonChatMetadataChangedEvent;

export function isDaemonGlobalEvent(
  value: unknown,
): value is DaemonGlobalEvent {
  if (!is.plainObject(value)) return false;
  switch (value.type) {
    case "chat-activity-changed":
    case "chat-attention-changed":
    case "chat-metadata-changed":
      return (
        Array.isArray(value.chatIds) &&
        value.chatIds.length > 0 &&
        value.chatIds.every(
          (chatId) => typeof chatId === "string" && chatId.length > 0,
        )
      );
    default:
      return false;
  }
}
