import type { QueryClient } from "@tanstack/react-query";
import type {
  Automation,
  CreateAutomationInput,
} from "@/features/schedule/schedule-model";

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { scheduleFixture } from "@/features/schedule/requests/fixtures";
import { scheduleQueryKeys } from "@/features/schedule/requests/keys";

export function automationListQueryOptions({
  staleTime = Number.POSITIVE_INFINITY,
}: {
  staleTime?: number;
} = {}) {
  return queryOptions({
    queryFn: async (): Promise<Automation[]> =>
      structuredClone(scheduleFixture),
    queryKey: scheduleQueryKeys.automations.list(),
    staleTime,
  });
}

export function createAutomationMutationOptions({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (input: CreateAutomationInput): Promise<Automation> => ({
      ...input,
      enabled: true,
      id: nanoid(),
      nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      runs: [],
      status: "active",
    }),
    onSuccess: (automation) => {
      queryClient.setQueryData<Automation[]>(
        scheduleQueryKeys.automations.list(),
        (current = []) => [...current, automation],
      );
    },
  });
}

export function setAutomationEnabledMutationOptions({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({ enabled, id }: { enabled: boolean; id: string }) => ({
      enabled,
      id,
    }),
    onSuccess: ({ enabled, id }) => {
      updateAutomation(queryClient, id, (automation) => ({
        ...automation,
        enabled,
        nextRunAt: enabled
          ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
          : undefined,
        status: enabled ? "active" : "paused",
      }));
    },
  });
}

export function runAutomationNowMutationOptions({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (id: string) => id,
    onSuccess: (id) => {
      updateAutomation(queryClient, id, (automation) => ({
        ...automation,
        runs: [
          {
            id: nanoid(),
            startedAt: new Date().toISOString(),
            status: "running",
            trigger: "manual",
          },
          ...automation.runs,
        ],
        status: "running",
      }));
    },
  });
}

export function deleteAutomationMutationOptions({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (id: string) => id,
    onSuccess: (id) => {
      queryClient.setQueryData<Automation[]>(
        scheduleQueryKeys.automations.list(),
        (current = []) => current.filter((automation) => automation.id !== id),
      );
    },
  });
}

function updateAutomation(
  queryClient: QueryClient,
  id: string,
  update: (automation: Automation) => Automation,
): void {
  queryClient.setQueryData<Automation[]>(
    scheduleQueryKeys.automations.list(),
    (current = []) =>
      current.map((automation) =>
        automation.id === id ? update(automation) : automation,
      ),
  );
}
