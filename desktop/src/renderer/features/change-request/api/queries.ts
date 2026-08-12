import type {
  ChangeRequest,
  ChangeRequestStatusResult,
  CheckSummary,
  MergeMethod,
} from "@angel-engine/daemon-api/source-control";
import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

interface ChangeRequestQueryContext {
  active: boolean;
  projectPath: string | null;
  providerIdentity: string | null;
  supportsList: boolean;
  supportsStatus: boolean;
}

export interface ChangeRequestStatusView {
  allowedMergeMethods: readonly MergeMethod[];
  author: string | null;
  baseRefName: string;
  body: string;
  changeRequest: ChangeRequest;
  checks: CheckSummary | null;
  defaultMergeMethod: MergeMethod;
  deleteBranchOnMerge: boolean;
  headRefName: string;
  number: number;
  state: "CLOSED" | "MERGED" | "OPEN";
  title: string;
  url: string;
  worktreeDirty: boolean;
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
      toStatus(await api.sourceControl.currentChangeRequest(projectPath ?? "")),
    queryKey: queryKeys.sourceControl.currentChangeRequest(providerIdentity),
    refetchInterval: enabled ? 30_000 : false,
    refetchOnWindowFocus: true,
  });
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

function toStatus(
  result: ChangeRequestStatusResult | null,
): ChangeRequestStatusView {
  if (result === null) return emptyStatus();
  const changeRequest = result.changeRequest;
  return {
    allowedMergeMethods: [...changeRequest.allowedMergeMethods],
    author: changeRequest.author?.login ?? null,
    baseRefName: changeRequest.target.name,
    body: changeRequest.body,
    checks: result.checks,
    defaultMergeMethod: changeRequest.defaultMergeMethod ?? "merge",
    deleteBranchOnMerge: false,
    headRefName: changeRequest.source.name,
    number: changeRequest.number ?? Number(changeRequest.id),
    state: changeRequest.state.toUpperCase() as "CLOSED" | "MERGED" | "OPEN",
    title: changeRequest.title,
    url: changeRequest.webUrl,
    worktreeDirty: false,
    changeRequest,
  };
}

function emptyStatus(): ChangeRequestStatusView {
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
    body: "",
    checks: null,
    defaultMergeMethod: "merge",
    deleteBranchOnMerge: false,
    headRefName: "",
    number: 0,
    state: "CLOSED",
    title: "",
    url: "",
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
