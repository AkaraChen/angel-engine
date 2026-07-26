import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

/**
 * A single turn publishes a conversation change on start and again on settle, and
 * the device that started the run receives its own echo. Batching collapses that
 * burst into one notification per chat.
 */
const CONVERSATION_COALESCE_MS = 150;

type ConversationListener = () => void;

const conversationListeners = new Map<string, Set<ConversationListener>>();

/**
 * Subscribes to `chat-conversation-changed` hints for one chat.
 *
 * The open conversation cannot poll for this: it probes `active-run` once when it
 * mounts, so a run started on another device would otherwise never appear, and a
 * run finished elsewhere would leave its history stale.
 */
export function subscribeChatConversation(
  chatId: string,
  listener: ConversationListener,
): () => void {
  const listeners = conversationListeners.get(chatId) ?? new Set();
  listeners.add(listener);
  conversationListeners.set(chatId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) conversationListeners.delete(chatId);
  };
}

function notifyConversations(chatIds: Iterable<string>): void {
  for (const chatId of chatIds) {
    for (const listener of conversationListeners.get(chatId) ?? []) listener();
  }
}

export function DaemonEventSync() {
  const { token } = useAuth();
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (token === null) return;

    let conversationTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingConversations = new Set<string>();

    const queueConversations = (chatIds: string[]) => {
      for (const chatId of chatIds) pendingConversations.add(chatId);
      if (conversationTimer !== undefined) return;
      conversationTimer = setTimeout(() => {
        conversationTimer = undefined;
        const chatIds = [...pendingConversations];
        pendingConversations.clear();
        notifyConversations(chatIds);
      }, CONVERSATION_COALESCE_MS);
    };

    const reconcile = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activity.all,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.list });
      // Conversation hints published while the socket was down are gone — there
      // is no replay — so every open chat reconciles on reconnect.
      queueConversations([...conversationListeners.keys()]);
    };

    const unsubscribe = daemon.events.subscribe({
      onEvent: (event) => {
        if (
          event.type === "chat-activity-changed" ||
          event.type === "chat-attention-changed"
        ) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.activity.all,
          });
        } else if (event.type === "chat-conversation-changed") {
          queueConversations(event.chatIds);
        } else if (event.type === "chat-metadata-changed") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.chats.list,
          });
        }
      },
      onOpen: reconcile,
    });

    return () => {
      if (conversationTimer !== undefined) clearTimeout(conversationTimer);
      unsubscribe();
    };
  }, [daemon, queryClient, token]);

  return null;
}
