import type { ChatActivity } from "@/platform/chat-types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

import { terminalAttentionId } from "./activity-model";

/**
 * The daemon's Fleet projection: one record per chat that is running, waiting
 * on the user, stuck, or holding an unread terminal marker. The status is read
 * verbatim — mobile never re-derives it from stream events, so a run the user
 * stopped explicitly simply has no record rather than a failed one.
 *
 * `DaemonEventSync` invalidates this on `chat-activity-changed` and on socket
 * reconnect, so the snapshot only needs a short stale window as a backstop.
 */
export function useChatActivityList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.activity.list,
    queryFn: async () => (await daemon.activity.list()).items,
    staleTime: 10_000,
  });
}

export function useChatActivity(chatId: string): ChatActivity | null {
  const query = useChatActivityList();
  return query.data?.find((activity) => activity.chatId === chatId) ?? null;
}

/**
 * Acknowledges the terminal marker of an opened chat. The ack carries the
 * activity's own `attentionId`, so a marker that belongs to a newer run is
 * rejected by the daemon (`read: false`) and refetched instead of cleared.
 *
 * The ack is irreversible, so it waits for `enabled` — the caller passes the
 * transcript's own loaded state, and a chat that failed to open keeps its
 * marker. The failure message is retained across the ack and returned so the
 * reason survives on screen after the projection has dropped the row.
 */
export function useReadTerminalActivity(
  chatId: string,
  { enabled }: { enabled: boolean },
): { failureMessage?: string } {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  const activity = useChatActivity(chatId);
  const { mutate: read } = useMutation({
    mutationFn: async (attentionId: string) =>
      daemon.activity.read(chatId, { attentionId }),
    onSuccess: (result, attentionId) => {
      if (!result.read) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.activity.list,
        });
        return;
      }
      queryClient.setQueryData<ChatActivity[]>(
        queryKeys.activity.list,
        (current) =>
          current?.filter(
            (candidate) =>
              candidate.chatId !== chatId ||
              terminalAttentionId(candidate) !== attentionId,
          ) ?? [],
      );
    },
  });

  const [retainedFailure, setRetainedFailure] = useState<{
    chatId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (activity?.status === "failed") {
      setRetainedFailure({ chatId, message: activity.failure.message });
    }
  }, [activity, chatId]);

  useEffect(() => {
    if (!enabled || activity === null) return;
    const attentionId = terminalAttentionId(activity);
    if (attentionId === undefined) return;
    read(attentionId);
  }, [activity, enabled, read]);

  return {
    failureMessage:
      retainedFailure?.chatId === chatId ? retainedFailure.message : undefined,
  };
}
