import type { ApiClient } from "@/platform/api-client";
import type { QueryClient } from "@tanstack/react-query";

import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

export function setupLifecycleQueryOptions(input: {
  api: ApiClient;
  chatId: string;
  enabled: boolean;
}) {
  return queryOptions({
    enabled: input.enabled,
    queryFn: () => input.api.chats.lifecycle(input.chatId),
    queryKey: queryKeys.worktrees.lifecycle(input.chatId),
    refetchInterval: (query) =>
      query.state.data?.snapshot.setup.status === "running" ? 300 : false,
  });
}

export function setupLifecycleMutationOptions(input: {
  action: "cancel" | "continue" | "discard" | "retry";
  api: ApiClient;
  chatId: string;
  queryClient: QueryClient;
}) {
  return {
    mutationFn: async (variables?: { setupApproval?: string }) => {
      switch (input.action) {
        case "cancel":
          return input.api.chats.cancelSetup(input.chatId);
        case "continue":
          return input.api.chats.continueSetup(input.chatId);
        case "discard":
          return input.api.chats.discardSetup(input.chatId);
        case "retry":
          if (variables?.setupApproval === undefined) {
            throw new Error("Setup approval is required.");
          }
          return input.api.chats.retrySetup(input.chatId, {
            setupApproval: variables.setupApproval,
          });
      }
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({
        queryKey: queryKeys.worktrees.lifecycle(input.chatId),
      });
      if (input.action === "discard") {
        await input.queryClient.invalidateQueries({
          queryKey: queryKeys.chats.all(),
        });
      }
    },
  };
}
