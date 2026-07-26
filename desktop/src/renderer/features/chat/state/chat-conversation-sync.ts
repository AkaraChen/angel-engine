import type { QueryClient } from "@tanstack/react-query";

import is from "@sindresorhus/is";
import { queryKeys } from "@/platform/query-keys";
import { selectSlot } from "./chat-run-reducer";
import { getChatRunContext } from "./chat-run-registry";
import { chatRunActions } from "./chat-run-store";

/**
 * Applies a `chat-conversation-changed` hint for one chat.
 *
 * The daemon publishes the hint when a run starts or settles somewhere else —
 * typically the phone — and this window has no other way to notice: it probed
 * `active-run` once when the chat mounted, and the chat-load query has a stale
 * window measured in tens of seconds.
 *
 * Two reactions, both idempotent:
 * - refetch the chat load so finished history arrives (`dataUpdatedAt` feeds
 *   `historyRevision`, which re-seeds the slot);
 * - attach to whatever run the daemon is executing, so the turn streams in.
 *
 * Skipped entirely while this window is streaming the chat itself: the run
 * stream is authoritative for an attached slot, and refetching history mid-turn
 * would fight the accumulating transcript.
 */
export function reconcileChatConversation(
  chatId: string,
  queryClient: QueryClient,
): void {
  if (!is.nonEmptyString(chatId)) return;
  if (selectSlot(getChatRunContext(), chatId)?.activeRun) return;

  void queryClient.invalidateQueries({
    queryKey: queryKeys.chats.detail(chatId),
  });
  chatRunActions.attachToActiveRun(chatId);
}

/** The chats this window has a slot for — the ones worth reconciling on reconnect. */
export function mountedChatIds(): string[] {
  return Object.values(getChatRunContext().slots)
    .map((slot) => slot.chatId)
    .filter((chatId): chatId is string => is.nonEmptyString(chatId));
}
