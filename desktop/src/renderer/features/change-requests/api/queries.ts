import type { ApiClient } from "@/platform/api-client";
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

interface PullRequestDetailQueryParams {
  api: ApiClient;
  enabled?: boolean;
  number: number | null;
  projectPath: string | null;
  providerIdentity: string | null;
  staleTime?: number;
  supported: boolean;
}

export function pullRequestDetailQueryOptions({
  api,
  enabled = true,
  number,
  projectPath,
  providerIdentity,
  staleTime = 15_000,
  supported,
}: PullRequestDetailQueryParams) {
  return queryOptions({
    enabled:
      enabled &&
      supported &&
      projectPath !== null &&
      providerIdentity !== null &&
      number !== null &&
      number > 0,
    queryFn: async () =>
      api.sourceControl.getChangeRequest(
        projectPath ?? "",
        String(number ?? 0),
      ),
    queryKey: queryKeys.sourceControl.changeRequest(
      providerIdentity,
      number === null ? null : String(number),
    ),
    retry: false,
    staleTime,
  });
}
