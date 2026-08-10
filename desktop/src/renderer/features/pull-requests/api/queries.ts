import type {
  GitHubListPullRequestsInput,
  GitHubViewPullRequestInput,
} from "@angel-engine/daemon-api/github";
import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

interface PullRequestListQueryParams {
  api: ApiClient;
  cwd?: string | null;
  enabled?: boolean;
  limit?: number;
  query?: string;
  staleTime?: number;
  state?: GitHubListPullRequestsInput["state"];
}

interface PullRequestDetailQueryParams {
  api: ApiClient;
  cwd?: string | null;
  enabled?: boolean;
  number: number | null;
  staleTime?: number;
}

interface PullRequestTemplateQueryParams {
  api: ApiClient;
  cwd?: string | null;
  enabled?: boolean;
  staleTime?: number;
}

export function pullRequestListQueryOptions({
  api,
  cwd,
  enabled = true,
  limit = 40,
  query = "",
  staleTime = 15_000,
  state = "open",
}: PullRequestListQueryParams) {
  return queryOptions({
    enabled: enabled && is.nonEmptyString(cwd),
    placeholderData: (previous) => previous,
    queryFn: async () =>
      api.github.listPullRequests({
        cwd: cwd ?? "",
        limit,
        query: is.nonEmptyString(query) ? query : undefined,
        state,
      }),
    queryKey: queryKeys.github.pullRequests(
      cwd ?? null,
      state ?? "open",
      query,
    ),
    retry: false,
    staleTime,
  });
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

export function pullRequestTemplateQueryOptions({
  api,
  cwd,
  enabled = true,
  staleTime = 60_000,
}: PullRequestTemplateQueryParams) {
  return queryOptions({
    enabled: enabled && is.nonEmptyString(cwd),
    queryFn: async () =>
      api.github.pullRequestTemplate({
        cwd: cwd ?? "",
      }),
    queryKey: queryKeys.github.pullRequestTemplate(cwd ?? null),
    retry: false,
    staleTime,
  });
}

export function createPullRequestMutationOptions({ api }: { api: ApiClient }) {
  return mutationOptions({
    mutationFn: (input: {
      base?: string;
      body?: string;
      cwd: string;
      draft?: boolean;
      head?: string;
      title: string;
    }) => api.github.createPullRequest(input),
  });
}

export function addPullRequestCommentMutationOptions({
  api,
}: {
  api: ApiClient;
}) {
  return mutationOptions({
    mutationFn: (input: { body: string; cwd: string; number: number }) =>
      api.github.addPullRequestComment(input),
  });
}

export function createWorkspaceFromPullRequestMutationOptions({
  api,
}: {
  api: ApiClient;
}) {
  return mutationOptions({
    mutationFn: (input: {
      number: number;
      projectId: string;
      runtime?: string;
      setupApproval?: string;
      title?: string;
    }) => api.github.createWorkspaceFromPullRequest(input),
  });
}
