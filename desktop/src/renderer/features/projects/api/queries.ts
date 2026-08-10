import type { ProjectFileSearchResult } from "@angel-engine/daemon-api/chat";
import type {
  Project,
  ProjectConfigResult,
  ProjectGitStatusResult,
  UpdateProjectConfigInput,
} from "@angel-engine/daemon-api/projects";

import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { invalidateChatQueries } from "@/features/chat/api/queries";
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

interface ProjectConfigQueryParams {
  api: ApiClient;
  enabled?: boolean;
  projectId?: string | null;
}

interface UpdateProjectConfigMutationParams {
  api: ApiClient;
  queryClient: QueryClient;
}

interface CreateProjectMutationParams {
  api: ApiClient;
  onSuccess?: (data: Project, variables: string) => Promise<void> | void;
  queryClient: QueryClient;
}

/** Items the project context menu offers beyond the path-launcher rows. */
export type ProjectContextMenuAction = "delete" | "settings";

export type ProjectContextMenuResult = "deleted" | "settings";

export interface ProjectContextMenuVariables {
  action: ProjectContextMenuAction;
  project: Project;
}

interface ProjectContextMenuMutationParams {
  api: ApiClient;
  onSuccess?: (
    data: ProjectContextMenuResult,
    variables: Project,
  ) => Promise<void> | void;
  queryClient: QueryClient;
}

export function gitHubRepositoryOwnersQueryOptions({
  api,
  enabled = true,
}: {
  api: ApiClient;
  enabled?: boolean;
}) {
  return queryOptions({
    enabled,
    queryFn: async () => api.github.listRepositoryOwners(),
    queryKey: queryKeys.github.repositoryOwners(),
    retry: false,
    // The picker is short-lived; a stale account list would silently hide an
    // org the user just joined.
    staleTime: 60_000,
  });
}

export function gitHubRepositoriesQueryOptions({
  api,
  owner,
}: {
  api: ApiClient;
  owner: string | null;
}) {
  return queryOptions({
    enabled: is.nonEmptyString(owner),
    queryFn: async () => {
      if (!is.nonEmptyString(owner)) {
        throw new Error("No owner selected");
      }
      return api.github.listRepositories({ owner });
    },
    queryKey: queryKeys.github.repositories(owner),
    retry: false,
    staleTime: 60_000,
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

export function projectConfigQueryOptions({
  api,
  enabled = true,
  projectId,
}: ProjectConfigQueryParams) {
  return queryOptions({
    enabled: enabled && is.nonEmptyString(projectId),
    queryFn: async (): Promise<ProjectConfigResult> => {
      if (!is.nonEmptyString(projectId)) {
        throw new Error("No project selected");
      }
      return api.projects.config({ projectId });
    },
    queryKey: queryKeys.projects.config(projectId ?? null),
    retry: false,
    // Settings live in a file the user can edit outside the app, so refetch on
    // every dialog open instead of trusting a cached read.
    staleTime: 0,
  });
}

export function updateProjectConfigMutationOptions({
  api,
  queryClient,
}: UpdateProjectConfigMutationParams) {
  return mutationOptions({
    mutationFn: async (input: UpdateProjectConfigInput) =>
      api.projects.updateConfig(input),
    onSuccess: (data) => {
      queryClient.setQueryData<ProjectConfigResult>(
        queryKeys.projects.config(data.projectId),
        data,
      );
    },
  });
}

export function createProjectMutationOptions({
  api,
  onSuccess,
  queryClient,
}: CreateProjectMutationParams) {
  return mutationOptions({
    mutationFn: async (path: string) => api.projects.create({ path }),
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
    mutationFn: async ({
      action,
      project,
    }: ProjectContextMenuVariables): Promise<ProjectContextMenuResult> => {
      if (action === "settings") return "settings";
      await api.projects.delete(project.id);
      return "deleted";
    },
    onSuccess: async (data, variables) => {
      if (data === "deleted") {
        await invalidateProjectQueries(queryClient);
        await invalidateChatQueries(queryClient);
      }
      await onSuccess?.(data, variables.project);
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
