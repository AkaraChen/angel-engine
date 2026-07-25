import type { CreateChatInput } from "@/platform/chat-types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

import { deriveChatSummaries } from "./chat-summary";
import { useChatAttentionList } from "./use-attention";

/**
 * The mobile chat list: fetches the daemon chat + project snapshots in parallel
 * and joins them into the row model the Home page renders. Fetching both under
 * one query key means a failure of either surfaces as a single error/loading
 * state instead of leaving the list stuck.
 */
export function useChatList() {
  const daemon = useDaemonClient();

  const chatsQuery = useQuery({
    queryKey: queryKeys.chats.list,
    queryFn: async () => {
      const [chats, projects] = await Promise.all([
        daemon.chats.list(),
        daemon.projects.list(),
      ]);
      return deriveChatSummaries(chats, projects);
    },
  });
  const attentionQuery = useChatAttentionList();
  const attentions = new Map(
    attentionQuery.data?.map((attention) => [attention.chatId, attention]),
  );

  return {
    data:
      chatsQuery.data?.map((chat) => ({
        ...chat,
        attention: attentions.get(chat.id) ?? null,
      })) ?? [],
    isError: chatsQuery.isError || attentionQuery.isError,
    isPending: chatsQuery.isPending || attentionQuery.isPending,
    refetch: async () => {
      await Promise.all([chatsQuery.refetch(), attentionQuery.refetch()]);
    },
  };
}

export function useProjectList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.projects.list,
    queryFn: async () => daemon.projects.list(),
  });
}

/** The agents available to start a chat with (`GET /api/agents`). */
export function useAgentList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.agents.list,
    queryFn: async () => daemon.agents.listAvailable(),
  });
}

/** Runtime-owned model options for a new chat. */
export function useRuntimeConfig({
  cwd,
  enabled,
  runtime,
}: {
  cwd?: string;
  enabled: boolean;
  runtime: string;
}) {
  const daemon = useDaemonClient();
  return useQuery({
    enabled: enabled && runtime.length > 0,
    queryKey: queryKeys.chats.runtimeConfig(runtime, cwd),
    queryFn: async () => daemon.chats.inspectConfig({ cwd, runtime }),
    retry: false,
    staleTime: 300_000,
  });
}

export function useCreateChat() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateChatInput) => daemon.chats.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chats.list });
    },
  });
}
