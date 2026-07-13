import type { ChatCreateInput } from "@angel-engine/daemon-api/chat";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

import { deriveChatSummaries } from "./chat-summary";

/**
 * The mobile chat list: fetches the daemon chat + project snapshots in parallel
 * and joins them into the row model the Home page renders. Fetching both under
 * one query key means a failure of either surfaces as a single error/loading
 * state instead of leaving the list stuck.
 */
export function useChatList() {
  const daemon = useDaemonClient();

  return useQuery({
    queryKey: queryKeys.chats.list,
    queryFn: async () => {
      const [chats, projects] = await Promise.all([
        daemon.listChats(),
        daemon.listProjects(),
      ]);
      return deriveChatSummaries(chats, projects);
    },
  });
}

export function useProjectList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.projects.list,
    queryFn: async () => daemon.listProjects(),
  });
}

/** The agents available to start a chat with (`GET /api/agents`). */
export function useAgentList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.agents.list,
    queryFn: async () => daemon.listAgents(),
  });
}

export function useCreateChat() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChatCreateInput) => daemon.createChat(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chats.list });
    },
  });
}
