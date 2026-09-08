import type { ProjectFileSearchResult } from "@angel-engine/daemon-api/chat";
import type {
  Project,
  ProjectGitStatusResult,
} from "@angel-engine/daemon-api/projects";
import type {
  RepositoryIdentity,
  RepositoryNamespace,
} from "@angel-engine/daemon-api/source-control";

import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/platform/query-keys";

interface ProjectListQueryParams {
  api: ApiClient;
  enabled?: boolean;
  staleTime?: number;
}

interface ProjectFileSearchQueryParams {
  api: ApiClient;
  enabled?: boolean;
  limit?: number;
  query: string;
  root: string;
  staleTime?: number;
}

interface ProjectGitStatusQueryParams {
  api: ApiClient;
  enabled?: boolean;
  projectId?: string | null;
  staleTime?: number;
}

interface SourceControlDiscoveryQueryParams {
  api: ApiClient;
  enabled?: boolean;
  limit?: number;
  projectPath: string | null;
  providerIdentity: string | null;
  query?: string;
  staleTime?: number;
  supported: boolean;
}

interface SourceControlRepositoriesQueryParams
  extends SourceControlDiscoveryQueryParams {
  namespace: readonly string[] | null;
}

export function sourceControlNamespacesQueryOptions({
  api,
  enabled = true,
  limit = 50,
  projectPath,
  providerIdentity,
  query = "",
  staleTime = 60_000,
  supported,
}: SourceControlDiscoveryQueryParams) {
  return queryOptions({
    enabled:
      enabled &&
      supported &&
      is.nonEmptyString(projectPath) &&
      is.nonEmptyString(providerIdentity),
    queryFn: async (): Promise<readonly RepositoryNamespace[]> => {
      if (!is.nonEmptyString(projectPath)) {
        throw new Error("No source-control project is active");
      }
      return api.sourceControl.listNamespaces(projectPath, query, limit);
    },
    queryKey: queryKeys.sourceControl.namespaces(
      providerIdentity,
      is.nonEmptyString(query) ? query : null,
      limit,
    ),
    retry: false,
    staleTime,
  });
}

export function sourceControlRepositoriesQueryOptions({
  api,
  enabled = true,
  limit = 50,
  namespace,
  projectPath,
  providerIdentity,
  query = "",
  staleTime = 60_000,
  supported,
}: SourceControlRepositoriesQueryParams) {
  return queryOptions({
    enabled:
      enabled &&
      supported &&
      is.nonEmptyString(projectPath) &&
      is.nonEmptyString(providerIdentity) &&
      namespace !== null &&
      namespace.length > 0,
    queryFn: async (): Promise<readonly RepositoryIdentity[]> => {
      if (!is.nonEmptyString(projectPath) || namespace === null) {
        throw new Error("No source-control namespace is active");
      }
      return api.sourceControl.listRepositories(
        projectPath,
        namespace,
        query,
        limit,
      );
    },
    queryKey: queryKeys.sourceControl.repositories(
      providerIdentity,
      namespace,
      is.nonEmptyString(query) ? query : null,
      limit,
    ),
    retry: false,
    staleTime,
  });
}

export function projectListQueryOptions({
  api,
  enabled = true,
  staleTime = 30_000,
}: ProjectListQueryParams) {
  return queryOptions({
    enabled,
    queryFn: async () => api.projects.list(),
    queryKey: queryKeys.projects.list(),
    staleTime,
  });
}

export function projectFileSearchQueryOptions({
  api,
  enabled = true,
  limit = 12,
  query,
  root,
  staleTime = 0,
}: ProjectFileSearchQueryParams) {
  return queryOptions({
    enabled: enabled && query.length > 0 && root.length > 0,
    queryFn: async (): Promise<ProjectFileSearchResult[]> =>
      api.projects.searchFiles({
        limit,
        query,
        root,
      }),
    queryKey: queryKeys.projects.fileSearch(root, query, limit),
    retry: false,
    staleTime,
  });
}

export function projectGitStatusQueryOptions({
  api,
  enabled = true,
  projectId,
  staleTime = 30_000,
}: ProjectGitStatusQueryParams) {
  return queryOptions({
    enabled: enabled && is.nonEmptyString(projectId),
    queryFn: async (): Promise<ProjectGitStatusResult> => {
      if (!is.nonEmptyString(projectId)) {
        throw new Error("No project selected");
      }
      return api.projects.gitStatus({ projectId });
    },
    queryKey: queryKeys.projects.gitStatus(projectId ?? null),
    retry: false,
    staleTime,
  });
}
