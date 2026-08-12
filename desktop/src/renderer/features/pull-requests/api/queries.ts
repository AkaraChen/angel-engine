import type { ChangeRequest } from "@angel-engine/daemon-api/source-control";
import type { GitHubPullRequestDetail } from "@angel-engine/daemon-api/github";
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
      toLegacyDetail(
        await api.sourceControl.getChangeRequest(
          projectPath ?? "",
          String(number ?? 0),
        ),
      ),
    queryKey: queryKeys.sourceControl.changeRequest(
      providerIdentity,
      number === null ? null : String(number),
    ),
    retry: false,
    staleTime,
  });
}

function toLegacyDetail(changeRequest: ChangeRequest): GitHubPullRequestDetail {
  return {
    additions: changeRequest.additions ?? 0,
    author: changeRequest.author?.login ?? null,
    baseRefName: changeRequest.target.name,
    body: changeRequest.body,
    changedFiles: changeRequest.changedFiles ?? 0,
    comments: [],
    commitCount: changeRequest.commitCount ?? 0,
    deletions: changeRequest.deletions ?? 0,
    headRefName: changeRequest.source.name,
    isDraft: changeRequest.draft,
    number: changeRequest.number ?? Number(changeRequest.id),
    owner: changeRequest.repository.namespace.join("/"),
    repo: changeRequest.repository.name,
    state: changeRequest.state.toUpperCase(),
    title: changeRequest.title,
    updatedAt: changeRequest.updatedAt ?? "",
    url: changeRequest.webUrl,
  };
}
