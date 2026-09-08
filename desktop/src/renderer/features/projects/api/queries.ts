import type { ProjectFileSearchResult } from "@angel-engine/daemon-api/chat";

import type { ApiClient } from "@/platform/api-client";
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
