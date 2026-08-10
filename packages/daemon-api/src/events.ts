import is from "@sindresorhus/is";

/**
 * A chat list row changed: title, pin, archive, project, runtime, or `updatedAt`.
 * Consumers refetch the chat list(s), not the conversation.
 */
export interface DaemonChatMetadataChangedEvent {
  chatIds: string[];
  type: "chat-metadata-changed";
}

/**
 * The contents of these chats changed: a run started or settled, history was
 * appended, or runtime settings (mode, permission mode, model, runtime) moved.
 * A consumer with one of these chats open reconciles it — refetch the history
 * and re-probe the active run — unless it is already attached to a run of its
 * own, in which case the run stream is authoritative.
 */
export interface DaemonChatConversationChangedEvent {
  chatIds: string[];
  type: "chat-conversation-changed";
}

export interface DaemonChatAttentionChangedEvent {
  chatIds: string[];
  type: "chat-attention-changed";
}

export interface DaemonChatActivityChangedEvent {
  chatIds: string[];
  type: "chat-activity-changed";
}

/** Automation definitions or their persisted run history changed. */
export interface DaemonAutomationsChangedEvent {
  automationIds: string[];
  type: "automations-changed";
}

export type DaemonGlobalEvent =
  | DaemonAutomationsChangedEvent
  | DaemonChatActivityChangedEvent
  | DaemonChatAttentionChangedEvent
  | DaemonChatConversationChangedEvent
  | DaemonChatMetadataChangedEvent;

export function isDaemonGlobalEvent(
  value: unknown,
): value is DaemonGlobalEvent {
  if (!is.plainObject(value)) return false;
  switch (value.type) {
    case "automations-changed":
      return (
        Array.isArray(value.automationIds) &&
        value.automationIds.length > 0 &&
        value.automationIds.every(
          (id) => typeof id === "string" && id.length > 0,
        )
      );
    case "chat-activity-changed":
    case "chat-attention-changed":
    case "chat-conversation-changed":
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
