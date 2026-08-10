import type {
  ShepherdSession,
  ShepherdStartInput,
} from "@angel-engine/daemon-api/shepherd";
import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

export type ShepherdSessionResult = { session: ShepherdSession | null };

export function shepherdSessionQueryOptions({
  api,
  chatId,
  enabled = true,
}: {
  api: ApiClient;
  chatId: string | null;
  enabled?: boolean;
}) {
  return queryOptions({
    enabled: enabled && Boolean(chatId),
    queryFn: async (): Promise<ShepherdSessionResult> => {
      if (!chatId) return { session: null };
      return api.shepherd.get(chatId);
    },
    queryKey: queryKeys.shepherd.session(chatId),
    staleTime: 15_000,
  });
}

export function startShepherdMutationOptions({
  api,
  queryClient,
}: {
  api: ApiClient;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: (input: ShepherdStartInput) => api.shepherd.start(input),
    onSuccess: async (session) => {
      queryClient.setQueryData(queryKeys.shepherd.session(session.chatId), {
        session,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.shepherd.session(session.chatId),
      });
    },
  });
}

export function stopShepherdMutationOptions({
  api,
  queryClient,
}: {
  api: ApiClient;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: (id: string) => api.shepherd.stop({ id }),
    onSuccess: async (session) => {
      queryClient.setQueryData(queryKeys.shepherd.session(session.chatId), {
        session,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.shepherd.session(session.chatId),
      });
    },
  });
}

export function resumeShepherdMutationOptions({
  api,
  queryClient,
}: {
  api: ApiClient;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: (id: string) => api.shepherd.resume({ id }),
    onSuccess: async (session) => {
      queryClient.setQueryData(queryKeys.shepherd.session(session.chatId), {
        session,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.shepherd.session(session.chatId),
      });
    },
  });
}

export function isShepherdActive(
  session: ShepherdSession | null | undefined,
): boolean {
  return session?.state === "watching" || session?.state === "queued";
}
