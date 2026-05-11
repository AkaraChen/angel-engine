import {
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";

import type { ApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";
import type {
  Chat,
  ChatLoadResult,
  ChatPrewarmResult,
  ChatRuntimeConfig,
} from "@/shared/chat";
import type { Project } from "@/shared/projects";

interface ChatListQueryParams {
  api: ApiClient;
  enabled?: boolean;
  staleTime?: number;
}

interface ChatLoadQueryParams {
  api: ApiClient;
  chatId?: string;
  enabled?: boolean;
  staleTime?: number;
}

interface ChatRuntimeConfigQueryParams {
  api: ApiClient;
  cwd?: string | null;
  enabled?: boolean;
  runtime?: string | null;
  staleTime?: number;
}

interface ChatPrewarmQueryParams {
  api: ApiClient;
  enabled?: boolean;
  projectId?: string | null;
  runtime?: string | null;
  staleTime?: number;
}

interface CreateProjectChatMutationParams {
  api: ApiClient;
  onSuccess?: (data: Chat, variables: Project) => Promise<void> | void;
  queryClient: QueryClient;
  runtime?: string;
}

type DeleteAllChatsResult = Awaited<
  ReturnType<ApiClient["chats"]["deleteAll"]>
>;

interface DeleteAllChatsMutationParams {
  api: ApiClient;
  onSuccess?: (data: DeleteAllChatsResult) => Promise<void> | void;
  queryClient: QueryClient;
}

type ChatContextMenuResult = Awaited<
  ReturnType<ApiClient["chats"]["showContextMenu"]>
>;

interface ChatContextMenuMutationParams {
  api: ApiClient;
  onSuccess?: (
    data: ChatContextMenuResult,
    variables: Chat,
  ) => Promise<void> | void;
  queryClient: QueryClient;
}

export function chatListQueryOptions({
  api,
  enabled = true,
  staleTime = 30_000,
}: ChatListQueryParams) {
  return queryOptions({
    enabled,
    queryFn: () => api.chats.list(),
    queryKey: queryKeys.chats.list(),
    staleTime,
  });
}

export function chatLoadQueryOptions({
  api,
  chatId,
  enabled = true,
  staleTime = 60_000,
}: ChatLoadQueryParams) {
  return queryOptions({
    enabled: enabled && Boolean(chatId),
    queryFn: (): Promise<ChatLoadResult> => {
      if (!chatId) {
        throw new Error("No chat selected");
      }
      return api.chats.load(chatId);
    },
    queryKey: queryKeys.chats.detail(chatId ?? null),
    retry: false,
    staleTime,
  });
}

export function chatLoadSuspenseQueryOptions({
  api,
  chatId,
  staleTime = 60_000,
}: Omit<ChatLoadQueryParams, "enabled" | "chatId"> & { chatId: string }) {
  return queryOptions({
    queryFn: (): Promise<ChatLoadResult> => api.chats.load(chatId),
    queryKey: queryKeys.chats.detail(chatId),
    retry: false,
    staleTime,
  });
}

export function chatRuntimeConfigQueryOptions({
  api,
  cwd,
  enabled = true,
  runtime,
  staleTime = 300_000,
}: ChatRuntimeConfigQueryParams) {
  return queryOptions({
    enabled: enabled && Boolean(runtime),
    queryFn: (): Promise<ChatRuntimeConfig> =>
      api.chats.inspectConfig({
        cwd: cwd ?? undefined,
        runtime: runtime ?? undefined,
      }),
    queryKey: queryKeys.chats.runtimeConfig(runtime ?? null, cwd ?? null),
    retry: false,
    staleTime,
  });
}

export function chatPrewarmQueryOptions({
  api,
  enabled = true,
  projectId,
  runtime,
  staleTime = 0,
}: ChatPrewarmQueryParams) {
  return queryOptions({
    enabled: enabled && Boolean(runtime),
    gcTime: 300_000,
    queryFn: (): Promise<ChatPrewarmResult> =>
      api.chats.prewarm({
        projectId: projectId ?? undefined,
        runtime: runtime ?? undefined,
      }),
    queryKey: queryKeys.chats.prewarm(runtime ?? null, projectId ?? null),
    retry: false,
    staleTime,
  });
}

export function createProjectChatMutationOptions({
  api,
  onSuccess,
  queryClient,
  runtime,
}: CreateProjectChatMutationParams) {
  return mutationOptions({
    mutationFn: (project: Project) =>
      api.chats.create({
        projectId: project.id,
        runtime,
      }),
    onSuccess: async (data, variables) => {
      await invalidateChatQueries(queryClient);
      await onSuccess?.(data, variables);
    },
  });
}

export function deleteAllChatsMutationOptions({
  api,
  onSuccess,
  queryClient,
}: DeleteAllChatsMutationParams) {
  return mutationOptions({
    mutationFn: () => api.chats.deleteAll(),
    onSuccess: async (data) => {
      await invalidateChatQueries(queryClient);
      await onSuccess?.(data);
    },
  });
}

export function chatContextMenuMutationOptions({
  api,
  onSuccess,
  queryClient,
}: ChatContextMenuMutationParams) {
  return mutationOptions({
    mutationFn: (chat: Chat) => api.chats.showContextMenu(chat.id),
    onSuccess: async (data, variables) => {
      if (data === "deleted") {
        await invalidateChatQueries(queryClient);
      }
      await onSuccess?.(data, variables);
    },
  });
}

export async function invalidateChatQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.chats.all(),
    refetchType: "none",
  });
  await queryClient.refetchQueries({
    queryKey: queryKeys.chats.list(),
    type: "active",
  });
}
