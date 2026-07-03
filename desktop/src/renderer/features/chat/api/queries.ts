import type {
  Chat,
  ChatCreationLocation,
  ChatLoadResult,
  ChatPrewarmResult,
  ChatRuntimeConfig,
} from "@shared/chat";

import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

interface ChatListQueryParams {
  api: ApiClient;
  enabled?: boolean;
  staleTime?: number;
}

interface ArchivedChatListQueryParams {
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

interface AgentSkillsQueryParams {
  api: ApiClient;
  enabled?: boolean;
  projectPath?: string | null;
  runtime?: string | null;
  staleTime?: number;
}

interface ChatPrewarmQueryParams {
  api: ApiClient;
  creationLocation?: ChatCreationLocation | null;
  enabled?: boolean;
  projectId?: string | null;
  runtime?: string | null;
  staleTime?: number;
}

interface RenameChatMutationParams {
  api: ApiClient;
  onSuccess?: (data: Chat) => Promise<void> | void;
  queryClient: QueryClient;
}

interface SetChatRuntimeMutationParams {
  api: ApiClient;
  onSuccess?: (data: Chat) => Promise<void> | void;
  queryClient: QueryClient;
}

interface ArchiveChatMutationParams {
  api: ApiClient;
  onSuccess?: (data: Chat, variables: Chat) => Promise<void> | void;
  queryClient: QueryClient;
}

interface ArchivedChatIdsMutationParams {
  api: ApiClient;
  onSuccess?: (
    data: Awaited<ReturnType<ApiClient["chats"]["archivedRestore"]>>,
    variables: Parameters<ApiClient["chats"]["archivedRestore"]>[0],
  ) => Promise<void> | void;
  queryClient: QueryClient;
}

interface DeleteArchivedChatMutationParams {
  api: ApiClient;
  onSuccess?: (
    data: Awaited<ReturnType<ApiClient["chats"]["archivedDelete"]>>,
    variables: Parameters<ApiClient["chats"]["archivedDelete"]>[0],
  ) => Promise<void> | void;
  queryClient: QueryClient;
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

const EMPTY_MESSAGES: ChatLoadResult["messages"] = [];

export function chatListQueryOptions({
  api,
  enabled = true,
  staleTime = 30_000,
}: ChatListQueryParams) {
  return queryOptions({
    enabled,
    queryFn: async () => api.chats.list(),
    queryKey: queryKeys.chats.list(),
    staleTime,
  });
}

export function archivedChatListQueryOptions({
  api,
  enabled = true,
  staleTime = 30_000,
}: ArchivedChatListQueryParams) {
  return queryOptions({
    enabled,
    queryFn: async (): Promise<Chat[]> => api.chats.archivedList(),
    queryKey: queryKeys.chats.archived(),
    staleTime,
  });
}

export function chatLoadSuspenseQueryOptions({
  api,
  chatId,
  staleTime = 60_000,
}: Omit<ChatLoadQueryParams, "enabled" | "chatId"> & { chatId: string }) {
  return queryOptions({
    queryFn: async (): Promise<ChatLoadResult> => api.chats.load(chatId),
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
    queryFn: async (): Promise<ChatRuntimeConfig> =>
      api.chats.inspectConfig({
        cwd: cwd ?? undefined,
        runtime: runtime ?? undefined,
      }),
    queryKey: queryKeys.chats.runtimeConfig(runtime ?? null, cwd ?? null),
    retry: false,
    staleTime,
  });
}

export function agentSkillsQueryOptions({
  api,
  enabled = true,
  projectPath,
  runtime,
  staleTime = 30_000,
}: AgentSkillsQueryParams) {
  return queryOptions({
    enabled: enabled && Boolean(runtime),
    queryFn: async () =>
      api.agents.listSkills({
        projectPath: projectPath ?? undefined,
        runtime: runtime ?? "",
      }),
    queryKey: queryKeys.agents.skills(runtime ?? null, projectPath ?? null),
    retry: false,
    staleTime,
  });
}

export function chatPrewarmQueryOptions({
  api,
  creationLocation,
  enabled = true,
  projectId,
  runtime,
  staleTime = 0,
}: ChatPrewarmQueryParams) {
  const normalizedCreationLocation = creationLocation ?? "project";

  return queryOptions({
    enabled:
      enabled && normalizedCreationLocation !== "worktree" && Boolean(runtime),
    gcTime: 300_000,
    queryFn: async (): Promise<ChatPrewarmResult> =>
      api.chats.prewarm({
        creationLocation: normalizedCreationLocation,
        projectId: projectId ?? undefined,
        runtime: runtime ?? undefined,
      }),
    queryKey: queryKeys.chats.prewarm(
      runtime ?? null,
      projectId ?? null,
      normalizedCreationLocation,
    ),
    retry: false,
    staleTime,
  });
}

export function renameChatMutationOptions({
  api,
  onSuccess,
  queryClient,
}: RenameChatMutationParams) {
  return mutationOptions({
    mutationFn: async (input: Parameters<ApiClient["chats"]["rename"]>[0]) =>
      api.chats.rename(input),
    onSuccess: async (data) => {
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        upsertChatInList(current, data),
      );
      queryClient.setQueryData<ChatLoadResult | undefined>(
        queryKeys.chats.detail(data.id),
        (current) => (current ? { ...current, chat: data } : current),
      );
      await onSuccess?.(data);
    },
  });
}

export function setChatRuntimeMutationOptions({
  api,
  onSuccess,
  queryClient,
}: SetChatRuntimeMutationParams) {
  return mutationOptions({
    mutationFn: async (
      input: Parameters<ApiClient["chats"]["setRuntime"]>[0],
    ) => api.chats.setRuntime(input),
    onSuccess: async (data) => {
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        upsertChatInList(current, data),
      );
      queryClient.setQueryData<ChatLoadResult | undefined>(
        queryKeys.chats.detail(data.id),
        (current) =>
          current
            ? { ...current, chat: data, config: undefined }
            : { chat: data, messages: EMPTY_MESSAGES },
      );
      await onSuccess?.(data);
    },
  });
}

export function archiveChatMutationOptions({
  api,
  onSuccess,
  queryClient,
}: ArchiveChatMutationParams) {
  return mutationOptions({
    mutationFn: async (chat: Chat) => api.chats.archive(chat.id),
    onSuccess: async (data, variables) => {
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        current.filter((chat) => chat.id !== data.id),
      );
      queryClient.setQueryData<ChatLoadResult | undefined>(
        queryKeys.chats.detail(data.id),
        (current) => (current ? { ...current, chat: data } : current),
      );
      await onSuccess?.(data, variables);
    },
  });
}

export function restoreArchivedChatsMutationOptions({
  api,
  onSuccess,
  queryClient,
}: ArchivedChatIdsMutationParams) {
  return mutationOptions({
    mutationFn: async (
      input: Parameters<ApiClient["chats"]["archivedRestore"]>[0],
    ) => api.chats.archivedRestore(input),
    onSuccess: async (data, variables) => {
      await invalidateChatQueries(queryClient);
      await refetchArchivedChatQueries(queryClient);
      await onSuccess?.(data, variables);
    },
  });
}

export function deleteArchivedChatsMutationOptions({
  api,
  onSuccess,
  queryClient,
}: DeleteArchivedChatMutationParams) {
  return mutationOptions({
    mutationFn: async (
      input: Parameters<ApiClient["chats"]["archivedDelete"]>[0],
    ) => api.chats.archivedDelete(input),
    onSuccess: async (data, variables) => {
      await invalidateChatQueries(queryClient);
      await refetchArchivedChatQueries(queryClient);
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
    mutationFn: async () => api.chats.deleteAll(),
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
    mutationFn: async (chat: Chat) => api.chats.showContextMenu(chat.id),
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

async function refetchArchivedChatQueries(queryClient: QueryClient) {
  await queryClient.refetchQueries({
    queryKey: queryKeys.chats.archived(),
    type: "active",
  });
}

function upsertChatInList(chats: Chat[], chat: Chat) {
  const next = chats.filter((item) => item.id !== chat.id);
  if (chat.archived) return next;
  next.unshift(chat);
  return next.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
