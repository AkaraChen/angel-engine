import type { GitHubViewPullRequestInput } from "@angel-engine/daemon-api/github";
import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

interface PullRequestDetailQueryParams {
  api: ApiClient;
  cwd?: string | null;
  enabled?: boolean;
  number: number | null;
  staleTime?: number;
}

export function pullRequestDetailQueryOptions({
  api,
  cwd,
  enabled = true,
  number,
  staleTime = 15_000,
}: PullRequestDetailQueryParams) {
  return queryOptions({
    enabled: enabled && is.nonEmptyString(cwd) && number !== null && number > 0,
    queryFn: async () =>
      api.github.viewPullRequest({
        cwd: cwd ?? "",
        number: number ?? 0,
      } satisfies GitHubViewPullRequestInput),
    queryKey: queryKeys.github.pullRequestDetail(cwd ?? null, number),
    retry: false,
    staleTime,
  });
}
