import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";

import { isDaemonGlobalEvent } from "@angel-engine/daemon-api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  mountedChatIds,
  reconcileChatConversation,
} from "@/features/chat/state/chat-conversation-sync";
import { useDaemonClient } from "@/platform/daemon";
import { queryKeys } from "@/platform/query-keys";

const RECONNECT_DELAY_MS = 1_000;
/**
 * A single turn publishes a conversation change on start and again on settle, and
 * the window that started the run receives its own echo. Batching collapses that
 * burst into one reconcile per chat.
 */
const CONVERSATION_COALESCE_MS = 150;

/**
 * Renderer-side subscription to the daemon's global event stream. The events
 * are invalidation hints only: every consumer still reads its state from the
 * matching `GET`, so a reconnect converges on the daemon snapshot rather than
 * on whatever the renderer accumulated while it was offline.
 *
 * The socket is opened from the daemon info directly instead of through
 * `daemon-client`, whose event URL resolves against `location.origin` — the
 * renderer is served from the app bundle, not from the daemon.
 */
export function DaemonEventSync() {
  const client = useDaemonClient();
  const queryClient = useQueryClient();
  const info = client?.info;

  useEffect(() => {
    if (info === undefined) return;

    let stopped = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let conversationTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingConversations = new Set<string>();

    const flushConversations = () => {
      conversationTimer = undefined;
      const chatIds = [...pendingConversations];
      pendingConversations.clear();
      for (const chatId of chatIds) {
        reconcileChatConversation(chatId, queryClient);
      }
    };

    const queueConversations = (chatIds: string[]) => {
      for (const chatId of chatIds) pendingConversations.add(chatId);
      if (conversationTimer !== undefined) return;
      conversationTimer = setTimeout(
        flushConversations,
        CONVERSATION_COALESCE_MS,
      );
    };

    const invalidateChatLists = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.list() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chats.archived(),
      });
    };

    const handleEvent = (event: DaemonGlobalEvent) => {
      switch (event.type) {
        case "chat-activity-changed":
        case "chat-attention-changed":
          void queryClient.invalidateQueries({
            queryKey: queryKeys.chatActivity.all(),
          });
          return;
        case "chat-conversation-changed":
          queueConversations(event.chatIds);
          return;
        case "chat-metadata-changed":
          // Archive/restore moves a row between the two lists, so both are stale.
          invalidateChatLists();
          return;
        case "shepherd-changed":
          // Stage 3 will invalidate the shepherd panel query. No consumer yet.
          return;
      }
    };

    const connect = () => {
      const next = openDaemonEventSocket(info);
      socket = next;
      next.addEventListener("message", (message) => {
        let candidate: unknown;
        try {
          candidate = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (isDaemonGlobalEvent(candidate)) handleEvent(candidate);
      });
      next.addEventListener("open", () => {
        // The socket may have been down across daemon-side changes; resync both
        // sides of the join. Activity alone is not enough: a chat created while
        // the socket was down has no local metadata, and every consumer that
        // joins the two would silently drop its rows.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chatActivity.all(),
        });
        invalidateChatLists();
        // Conversation hints published while the socket was down are simply gone
        // — there is no replay — so every open chat reconciles on reconnect.
        queueConversations(mountedChatIds());
      });
      next.addEventListener("close", () => {
        if (stopped || socket !== next) return;
        socket = undefined;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      if (conversationTimer !== undefined) clearTimeout(conversationTimer);
      socket?.close();
      socket = undefined;
    };
  }, [info, queryClient]);

  return null;
}

function openDaemonEventSocket(info: DaemonInfo): WebSocket {
  return new WebSocket(
    `ws://${info.host}:${info.port}/api/events`,
    `angel-engine-token.${info.token}`,
  );
}
