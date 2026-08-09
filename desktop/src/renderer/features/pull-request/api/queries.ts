import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

export function pullRequestStatusQueryOptions({
  active,
  api,
  root,
}: {
  active: boolean;
  api: ApiClient;
  root: string;
}) {
  return queryOptions({
    enabled: active,
    queryFn: async () => api.github.pullRequestStatus({ cwd: root }),
    queryKey: queryKeys.github.pullRequest(root),
    refetchInterval: active ? 30_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function mergePullRequestMutationOptions({
  api,
  queryClient,
  root,
}: {
  api: ApiClient;
  queryClient: QueryClient;
  root: string;
}) {
  return mutationOptions({
    mutationFn: api.github.mergePullRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.github.pullRequest(root),
      });
    },
  });
}

export function resolveReviewThreadMutationOptions({
  api,
  queryClient,
  root,
}: {
  api: ApiClient;
  queryClient: QueryClient;
  root: string;
}) {
  return mutationOptions({
    mutationFn: api.github.resolveReviewThread,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.github.pullRequest(root),
      });
    },
  });
}
