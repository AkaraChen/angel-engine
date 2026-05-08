import {
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";

import type { ApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";
import type { Project } from "@/shared/projects";

interface ProjectListQueryParams {
  api: ApiClient;
  enabled?: boolean;
  staleTime?: number;
}

interface CreateProjectMutationParams {
  api: ApiClient;
  onSuccess?: (data: Project, variables: string) => Promise<void> | void;
  queryClient: QueryClient;
}

type ProjectContextMenuResult = Awaited<
  ReturnType<ApiClient["projects"]["showContextMenu"]>
>;

interface ProjectContextMenuMutationParams {
  api: ApiClient;
  onSuccess?: (
    data: ProjectContextMenuResult,
    variables: Project,
  ) => Promise<void> | void;
  queryClient: QueryClient;
}

export function projectListQueryOptions({
  api,
  enabled = true,
  staleTime = 30_000,
}: ProjectListQueryParams) {
  return queryOptions({
    enabled,
    queryFn: () => api.projects.list(),
    queryKey: queryKeys.projects.list(),
    staleTime,
  });
}

export function createProjectMutationOptions({
  api,
  onSuccess,
  queryClient,
}: CreateProjectMutationParams) {
  return mutationOptions({
    mutationFn: (path: string) => api.projects.create({ path }),
    onSuccess: async (data, variables) => {
      await invalidateProjectQueries(queryClient);
      await onSuccess?.(data, variables);
    },
  });
}

export function projectContextMenuMutationOptions({
  api,
  onSuccess,
  queryClient,
}: ProjectContextMenuMutationParams) {
  return mutationOptions({
    mutationFn: (project: Project) => api.projects.showContextMenu(project.id),
    onSuccess: async (data, variables) => {
      if (data === "deleted") {
        await invalidateProjectQueries(queryClient);
      }
      await onSuccess?.(data, variables);
    },
  });
}

export async function invalidateProjectQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.projects.all(),
    refetchType: "none",
  });
  await queryClient.refetchQueries({
    queryKey: queryKeys.projects.list(),
    type: "active",
  });
}
