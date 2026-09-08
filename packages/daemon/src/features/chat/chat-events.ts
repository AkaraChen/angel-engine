import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";

import { Context, Layer } from "effect";

export interface EventPublisher {
  publish: (event: DaemonGlobalEvent) => void;
}

/**
 * The daemon's vocabulary for the global event stream, so every emitter agrees on
 * which change belongs on which channel:
 *
 * - `metadataChanged` — a chat list row moved (title, pin, archive, project,
 *   runtime, `updatedAt`).
 * - `conversationChanged` — the contents of a chat moved (a run started or
 *   settled, history was appended, runtime settings changed).
 * - `activityChanged` — the Fleet projection for a chat moved. Attention rides
 *   along because it is derived from the same projection.
 *
 * All three are invalidation hints without a payload: consumers re-read from the
 * matching `GET`, which is what makes a reconnect converge on the daemon's
 * snapshot rather than on whatever a client accumulated while it was offline.
 */
export interface ChatEventsApi {
  activityChanged: (chatId: string) => void;
  automationsChanged: (automationIds: string[]) => void;
  conversationChanged: (chatIds: string[]) => void;
  metadataChanged: (chatIds: string[]) => void;
}

export class ChatEvents extends Context.Tag("daemon/ChatEvents")<
  ChatEvents,
  ChatEventsApi
>() {}

export function createChatEvents(publisher: EventPublisher): ChatEventsApi {
  return {
    activityChanged(chatId) {
      publisher.publish({ chatIds: [chatId], type: "chat-activity-changed" });
      publisher.publish({ chatIds: [chatId], type: "chat-attention-changed" });
    },
    automationsChanged(automationIds) {
      if (automationIds.length === 0) return;
      publisher.publish({ automationIds, type: "automations-changed" });
    },
    conversationChanged(chatIds) {
      if (chatIds.length === 0) return;
      publisher.publish({ chatIds, type: "chat-conversation-changed" });
    },
    metadataChanged(chatIds) {
      if (chatIds.length === 0) return;
      publisher.publish({ chatIds, type: "chat-metadata-changed" });
    },
  };
}

export function chatEventsLayer(events: ChatEventsApi) {
  return Layer.succeed(ChatEvents, events);
}
