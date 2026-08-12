import type {
  ChangeRequest,
  ChangeRequestStatusResult,
  MergeMethod,
} from "@angel-engine/daemon-api/source-control";
import type {
  GitHubPullRequestCheck,
  GitHubPullRequestStatus,
} from "@angel-engine/daemon-api/github";
import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

const UNKNOWN_MERGEABILITY_RETRY_DELAY_MS = 2_000;
const UNKNOWN_MERGEABILITY_RETRY_LIMIT = 3;

interface ChangeRequestQueryContext {
  active: boolean;
  projectPath: string | null;
  providerIdentity: string | null;
  supportsList: boolean;
  supportsStatus: boolean;
}

export type PullRequestStatusView = GitHubPullRequestStatus & {
  changeRequest: ChangeRequest;
};

export async function retryUnknownMergeability<
  T extends GitHubPullRequestStatus,
>(
  fetchStatus: () => Promise<T>,
  pause: (delayMs: number) => Promise<void> = delay,
): Promise<T> {
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
  projectPath,
  providerIdentity,
  supportsList,
  supportsStatus,
}: ChangeRequestQueryContext & { api: ApiClient }) {
  const enabled =
    active &&
    projectPath !== null &&
    providerIdentity !== null &&
    supportsList &&
    supportsStatus;
  return queryOptions({
    enabled,
    queryFn: async () =>
      retryUnknownMergeability(async () =>
        toLegacyStatus(
          await api.sourceControl.currentChangeRequest(projectPath ?? ""),
        ),
      ),
    queryKey: queryKeys.sourceControl.currentChangeRequest(providerIdentity),
    refetchInterval: enabled ? 30_000 : false,
    refetchOnWindowFocus: true,
  });
}

async function delay(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function mergePullRequestMutationOptions({
  api,
  projectPath,
  providerIdentity,
  queryClient,
}: {
  api: ApiClient;
  projectPath: string | null;
  providerIdentity: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: (input: {
      deleteSourceBranch: boolean;
      id: string;
      method: MergeMethod;
    }) =>
      api.sourceControl.mergeChangeRequest(input.id, {
        deleteSourceBranch: input.deleteSourceBranch,
        method: input.method,
        projectPath: projectPath ?? "",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey:
          queryKeys.sourceControl.currentChangeRequest(providerIdentity),
      });
    },
  });
}

export function resolveReviewThreadMutationOptions({
  api,
  projectPath,
  providerIdentity,
  queryClient,
}: {
  api: ApiClient;
  projectPath: string | null;
  providerIdentity: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: (threadId: string) =>
      api.sourceControl.resolveReviewThread(projectPath ?? "", threadId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sourceControl.reviewThreadsRoot(providerIdentity),
      });
    },
  });
}

export function checksSummaryQueryOptions({
  active,
  api,
  changeRequestId,
  projectPath,
  providerIdentity,
  supported,
}: {
  active: boolean;
  api: ApiClient;
  changeRequestId: string | null;
  projectPath: string | null;
  providerIdentity: string | null;
  supported: boolean;
}) {
  return queryOptions({
    enabled:
      active &&
      supported &&
      is.nonEmptyString(changeRequestId) &&
      projectPath !== null &&
      providerIdentity !== null,
    queryFn: () =>
      api.sourceControl.checksSummary(projectPath ?? "", changeRequestId ?? ""),
    queryKey: queryKeys.sourceControl.checksSummary(
      providerIdentity,
      changeRequestId,
    ),
    refetchInterval: (query) => (query.state.data?.hasPending ? 15_000 : false),
    retry: false,
    staleTime: 5_000,
  });
}

export function reviewThreadsQueryOptions({
  active,
  api,
  changeRequestId,
  projectPath,
  providerIdentity,
  supported,
}: {
  active: boolean;
  api: ApiClient;
  changeRequestId: string | null;
  projectPath: string | null;
  providerIdentity: string | null;
  supported: boolean;
}) {
  return queryOptions({
    enabled:
      active &&
      supported &&
      is.nonEmptyString(changeRequestId) &&
      projectPath !== null &&
      providerIdentity !== null,
    queryFn: () =>
      api.sourceControl.reviewThreads(projectPath ?? "", changeRequestId ?? ""),
    queryKey: queryKeys.sourceControl.reviewThreads(
      providerIdentity,
      changeRequestId,
    ),
    retry: false,
    staleTime: 5_000,
  });
}

function toLegacyStatus(
  result: ChangeRequestStatusResult | null,
): PullRequestStatusView {
  if (result === null) return emptyLegacyStatus();
  const changeRequest = result.changeRequest;
  const github = githubExtension(changeRequest);
  return {
    allowedMergeMethods: [...changeRequest.allowedMergeMethods],
    author: changeRequest.author?.login ?? null,
    baseRefName: changeRequest.target.name,
    behindBy: 0,
    body: changeRequest.body,
    checks: result.checks?.checks.map(toLegacyCheck) ?? [],
    defaultMergeMethod: changeRequest.defaultMergeMethod ?? "merge",
    deleteBranchOnMerge: false,
    headRefName: changeRequest.source.name,
    isDraft: changeRequest.draft,
    mergeable: readMergeable(github.mergeable),
    mergeStateStatus: readMergeStateStatus(github.mergeStateStatus),
    mergedAt: changeRequest.mergedAt,
    number: changeRequest.number ?? Number(changeRequest.id),
    reviewDecision:
      changeRequest.reviewDecision === "none"
        ? null
        : (changeRequest.reviewDecision.replace("-", "_").toUpperCase() as
            | "APPROVED"
            | "CHANGES_REQUESTED"
            | "REVIEW_REQUIRED"),
    state: changeRequest.state.toUpperCase() as "CLOSED" | "MERGED" | "OPEN",
    title: changeRequest.title,
    unresolvedThreads: [],
    url: changeRequest.webUrl,
    viewerCanMerge: changeRequest.viewerCanMerge ?? false,
    worktreeDirty: false,
    changeRequest,
  };
}

function toLegacyCheck(
  check: NonNullable<ChangeRequestStatusResult["checks"]>["checks"][number],
): GitHubPullRequestCheck {
  return {
    name: check.name,
    required: check.requiredness === "required",
    state:
      check.status !== "completed"
        ? "pending"
        : check.conclusion === "success"
          ? "success"
          : check.conclusion === "skipped" || check.conclusion === "neutral"
            ? "skipped"
            : "failure",
    url: check.detailsUrl,
  };
}

function githubExtension(
  changeRequest: ChangeRequest,
): Record<string, unknown> {
  const github = changeRequest.extensions?.github;
  return typeof github === "object" && github !== null
    ? (github as Record<string, unknown>)
    : {};
}

function readMergeable(value: unknown) {
  return value === "CONFLICTING" || value === "MERGEABLE" ? value : "UNKNOWN";
}

function readMergeStateStatus(value: unknown) {
  return value === "BEHIND" ||
    value === "BLOCKED" ||
    value === "CLEAN" ||
    value === "DIRTY" ||
    value === "DRAFT" ||
    value === "HAS_HOOKS" ||
    value === "UNSTABLE"
    ? value
    : "UNKNOWN";
}

function emptyLegacyStatus(): PullRequestStatusView {
  const repository = {
    displayPath: "",
    host: "",
    name: "",
    namespace: [],
    providerId: "",
    remoteId: null,
    webUrl: null,
  };
  return {
    allowedMergeMethods: [],
    author: null,
    baseRefName: "",
    behindBy: 0,
    body: "",
    checks: [],
    defaultMergeMethod: "merge",
    deleteBranchOnMerge: false,
    headRefName: "",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "UNKNOWN",
    mergedAt: null,
    number: 0,
    reviewDecision: null,
    state: "CLOSED",
    title: "",
    unresolvedThreads: [],
    url: "",
    viewerCanMerge: false,
    worktreeDirty: false,
    changeRequest: {
      additions: null,
      allowedMergeMethods: [],
      author: null,
      body: "",
      changedFiles: null,
      commitCount: null,
      createdAt: null,
      defaultMergeMethod: null,
      deletions: null,
      draft: false,
      id: "",
      mergeRequirements: [],
      mergedAt: null,
      number: null,
      repository,
      reviewDecision: "none",
      source: { name: "", oid: null, repository },
      state: "closed",
      target: { name: "", oid: null, repository },
      title: "",
      updatedAt: null,
      viewerCanMerge: false,
      webUrl: "",
    },
  };
}
