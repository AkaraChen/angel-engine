import type {
  CreateCustomAgentInput,
  UpdateCustomAgentInput,
} from "@angel-engine/daemon-api/agents";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@angel-engine/daemon-api/projects";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

export function useProjectList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.projects.list,
    queryFn: async () => daemon.projects.list(),
  });
}

export function useAgentList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.agents.list,
    queryFn: async () => daemon.agents.listAvailable(),
  });
}

export function useCustomAgentList() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.agents.custom,
    queryFn: async () => daemon.agents.listCustom(),
  });
}

export function useCreateProject() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) =>
      daemon.projects.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projects.list,
      });
    },
  });
}

export function useUpdateProject() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProjectInput) =>
      daemon.projects.update(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chats.list }),
      ]);
    },
  });
}

export function useProjectDeleteImpact() {
  const daemon = useDaemonClient();
  return useMutation({
    mutationFn: async (id: string) => daemon.projects.deleteImpact(id),
  });
}

export function useDeleteProject() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => daemon.projects.delete(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chats.list }),
      ]);
    },
  });
}

export function useCreateCustomAgent() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCustomAgentInput) =>
      daemon.agents.createCustom(input),
    onSuccess: async () => {
      await invalidateAgents(queryClient);
    },
  });
}

export function useUpdateCustomAgent() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCustomAgentInput) =>
      daemon.agents.updateCustom(input),
    onSuccess: async () => {
      await invalidateAgents(queryClient);
    },
  });
}

export function useCustomAgentDeleteImpact() {
  const daemon = useDaemonClient();
  return useMutation({
    mutationFn: async (id: string) => daemon.agents.deleteCustomImpact(id),
  });
}

export function useDeleteCustomAgent() {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => daemon.agents.deleteCustom(id),
    onSuccess: async () => {
      await Promise.all([
        invalidateAgents(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.chats.list }),
      ]);
    },
  });
}

async function invalidateAgents(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list }),
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.custom }),
  ]);
}
