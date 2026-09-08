import type { ProjectFileSearchResult } from "@angel-engine/daemon-api/chat";
import type {
  Project,
  ProjectGitStatusResult,
} from "@angel-engine/daemon-api/projects";

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
