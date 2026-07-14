import type { ChatStreamEvent } from "./chat";

export interface DaemonChatStreamEvent {
  event: ChatStreamEvent;
  streamId: string;
  type: "chat-stream";
}

export interface DaemonChatMetadataChangedEvent {
  chatIds: string[];
  type: "chat-metadata-changed";
}

export type DaemonGlobalEvent =
  | DaemonChatMetadataChangedEvent
  | DaemonChatStreamEvent;
