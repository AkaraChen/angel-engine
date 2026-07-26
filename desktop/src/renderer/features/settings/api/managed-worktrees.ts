import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import {
  invalidateChatQueries,
  refetchArchivedChatQueries,
} from "@/features/chat/api/queries";
import { queryKeys } from "@/platform/query-keys";

interface ManagedWorktreeListQueryParams {
  api: ApiClient;
  enabled?: boolean;
  staleTime?: number;
}

interface DeleteManagedWorktreesMutationParams {
  api: ApiClient;
  onSuccess?: (
    data: Awaited<ReturnType<ApiClient["worktrees"]["deleteManaged"]>>,
    variables: Parameters<ApiClient["worktrees"]["deleteManaged"]>[0],
  ) => Promise<void> | void;
  queryClient: QueryClient;
}

export function managedWorktreeListQueryOptions({
  api,
  enabled = true,
  staleTime = 0,
}: ManagedWorktreeListQueryParams) {
  return queryOptions({
    enabled,
    queryFn: async () => api.worktrees.listManaged({ eligibleOnly: true }),
    queryKey: queryKeys.worktrees.managedEligible(),
    staleTime,
  });
}

export function deleteManagedWorktreesMutationOptions({
  api,
  onSuccess,
  queryClient,
}: DeleteManagedWorktreesMutationParams) {
  return mutationOptions({
    mutationFn: async (
      input: Parameters<ApiClient["worktrees"]["deleteManaged"]>[0],
    ) => api.worktrees.deleteManaged(input),
    onSuccess: async (data, variables) => {
      await invalidateChatQueries(queryClient);
      await refetchArchivedChatQueries(queryClient);
      await invalidateManagedWorktreeQueries(queryClient);
      await onSuccess?.(data, variables);
    },
  });
}

export async function invalidateManagedWorktreeQueries(
  queryClient: QueryClient,
) {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.worktrees.all(),
    refetchType: "none",
  });
  await queryClient.refetchQueries({
    queryKey: queryKeys.worktrees.managedEligible(),
    type: "active",
  });
}
