import type {
  CreateCustomAgentInput,
  CustomAgentRuntime,
  UpdateCustomAgentInput,
} from "@angel-engine/daemon-api/agents";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@angel-engine/daemon-api/projects";
import type { DaemonClient } from "@angel-engine/daemon-client";
import type { QueryClient } from "@tanstack/react-query";

import { mutationOptions, queryOptions } from "@tanstack/react-query";

import { queryKeys } from "@/platform/query-keys";

interface QueryParams {
  daemon: DaemonClient;
  enabled?: boolean;
  staleTime?: number;
}

interface ProjectImpactQueryParams extends QueryParams {
  projectId: string | null;
}

interface CustomAgentImpactQueryParams extends QueryParams {
  agentId: CustomAgentRuntime | null;
}

interface MutationParams {
  daemon: DaemonClient;
  queryClient: QueryClient;
}

export function projectListQueryOptions({
  daemon,
  enabled = true,
  staleTime = 30_000,
}: QueryParams) {
  return queryOptions({
    enabled,
    queryFn: async () => daemon.projects.list(),
    queryKey: queryKeys.projects.list,
    staleTime,
  });
}

export function customAgentListQueryOptions({
  daemon,
  enabled = true,
  staleTime = 30_000,
}: QueryParams) {
  return queryOptions({
    enabled,
    queryFn: async () => daemon.agents.listCustom(),
    queryKey: queryKeys.agents.customList,
    staleTime,
  });
}

export function projectDeleteImpactQueryOptions({
  daemon,
  enabled = true,
  projectId,
  staleTime = 0,
}: ProjectImpactQueryParams) {
  return queryOptions({
    enabled: enabled && projectId !== null,
    queryFn: async () => {
      if (projectId === null) throw new Error("No project selected.");
      const [activeChats, archivedChats] = await Promise.all([
        daemon.chats.list(),
        daemon.chats.archivedList(),
      ]);
      return {
        chatCount: [...activeChats, ...archivedChats].filter(
          (chat) => chat.projectId === projectId,
        ).length,
      };
    },
    queryKey: queryKeys.projects.deleteImpact(projectId),
    retry: false,
    staleTime,
  });
}

export function customAgentDeleteImpactQueryOptions({
  agentId,
  daemon,
  enabled = true,
  staleTime = 0,
}: CustomAgentImpactQueryParams) {
  return queryOptions({
    enabled: enabled && agentId !== null,
    queryFn: async () => {
      if (agentId === null) throw new Error("No custom agent selected.");
      return daemon.agents.deleteCustomImpact(agentId);
    },
    queryKey: queryKeys.agents.customDeleteImpact(agentId),
    retry: false,
    staleTime,
  });
}

export function createProjectMutationOptions({
  daemon,
  queryClient,
}: MutationParams) {
  return mutationOptions({
    mutationFn: async (input: CreateProjectInput) =>
      daemon.projects.create(input),
    onSuccess: async () => {
      await invalidateProjects(queryClient);
    },
  });
}

export function updateProjectMutationOptions({
  daemon,
  queryClient,
}: MutationParams) {
  return mutationOptions({
    mutationFn: async (input: UpdateProjectInput) =>
      daemon.projects.update(input),
    onSuccess: async () => {
      await invalidateProjects(queryClient);
    },
  });
}

export function deleteProjectMutationOptions({
  daemon,
  queryClient,
}: MutationParams) {
  return mutationOptions({
    mutationFn: async (projectId: string) => daemon.projects.delete(projectId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chats.all }),
      ]);
    },
  });
}

export function createCustomAgentMutationOptions({
  daemon,
  queryClient,
}: MutationParams) {
  return mutationOptions({
    mutationFn: async (input: CreateCustomAgentInput) =>
      daemon.agents.createCustom(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all,
      });
    },
  });
}

export function updateCustomAgentMutationOptions({
  daemon,
  queryClient,
}: MutationParams) {
  return mutationOptions({
    mutationFn: async (input: UpdateCustomAgentInput) =>
      daemon.agents.updateCustom(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all,
      });
    },
  });
}

export function deleteCustomAgentMutationOptions({
  daemon,
  queryClient,
}: MutationParams) {
  return mutationOptions({
    mutationFn: async (agentId: CustomAgentRuntime) =>
      daemon.agents.deleteCustom(agentId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chats.all }),
      ]);
    },
  });
}

async function invalidateProjects(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.chats.all }),
  ]);
}
