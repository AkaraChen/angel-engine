import type { ChatAttention } from "@/platform/chat-types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

export function useChatAttentionList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.attention.list,
    queryFn: async () => (await daemon.attention.list()).attentions,
  });
}

export function useReadCompletedAttention(chatId: string) {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  const attentionQuery = useChatAttentionList();
  const attention = attentionQuery.data?.find(
    (candidate) => candidate.chatId === chatId,
  );
  const { mutate: read } = useMutation({
    mutationFn: async (attentionId: string) =>
      daemon.attention.read(chatId, { attentionId }),
    onSuccess: (result, attentionId) => {
      if (!result.read) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.attention.list,
        });
        return;
      }
      queryClient.setQueryData<ChatAttention[]>(
        queryKeys.attention.list,
        (current) =>
          current?.filter(
            (candidate) =>
              candidate.chatId !== chatId || candidate.id !== attentionId,
          ) ?? [],
      );
    },
  });

  useEffect(() => {
    if (attention?.status === "completed") read(attention.id);
  }, [attention, read]);
}
