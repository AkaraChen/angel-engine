import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

const UNKNOWN_MERGEABILITY_RETRY_DELAY_MS = 2_000;
const UNKNOWN_MERGEABILITY_RETRY_LIMIT = 3;

type PullRequestStatus = Awaited<
  ReturnType<ApiClient["github"]["pullRequestStatus"]>
>;

export async function retryUnknownMergeability(
  fetchStatus: () => Promise<PullRequestStatus>,
  pause: (delayMs: number) => Promise<void> = delay,
) {
  let status = await fetchStatus();
  for (
    let attempt = 0;
    status.mergeable === "UNKNOWN" &&
    attempt < UNKNOWN_MERGEABILITY_RETRY_LIMIT;
    attempt += 1
  ) {
    await pause(UNKNOWN_MERGEABILITY_RETRY_DELAY_MS);
    status = await fetchStatus();
  }
  return status;
}

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
    queryFn: async () =>
      retryUnknownMergeability(async () =>
        api.github.pullRequestStatus({ cwd: root }),
      ),
    queryKey: queryKeys.github.pullRequest(root),
    refetchInterval: active ? 30_000 : false,
    refetchOnWindowFocus: true,
  });
}

async function delay(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
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
