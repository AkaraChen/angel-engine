import type { ChatActivity } from "@angel-engine/daemon-api/chat";
import type { ApiClient } from "@/platform/api-client";

import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

interface ChatActivityListQueryParams {
  api: ApiClient;
  enabled?: boolean;
  staleTime?: number;
}

/**
 * The daemon pushes `chat-activity-changed` on every projection change, so the
 * snapshot only needs a short stale window as a reconnect/refocus backstop.
 */
export function chatActivityListQueryOptions({
  api,
  enabled = true,
  staleTime = 10_000,
}: ChatActivityListQueryParams) {
  return queryOptions({
    enabled,
    queryFn: async (): Promise<ChatActivity[]> => {
      const { items } = await api.activity.list();
      return items;
    },
    queryKey: queryKeys.chatActivity.list(),
    staleTime,
  });
}
