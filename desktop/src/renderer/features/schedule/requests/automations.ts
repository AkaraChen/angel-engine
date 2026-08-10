import type { QueryClient } from "@tanstack/react-query";
import type { Automation as DaemonAutomation } from "@angel-engine/daemon-api/automations";
import type {
  Automation,
  CreateAutomationInput,
} from "@/features/schedule/schedule-model";

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { scheduleQueryKeys } from "@/features/schedule/requests/keys";
import { getApiClient } from "@/platform/api-client";

export function automationListQueryOptions({
  staleTime = Number.POSITIVE_INFINITY,
}: {
  staleTime?: number;
} = {}) {
  return queryOptions({
    queryFn: async (): Promise<Automation[]> =>
      (await getApiClient().automations.list()).map(toRendererAutomation),
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
    mutationFn: async (input: CreateAutomationInput): Promise<Automation> =>
      toRendererAutomation(
        await getApiClient().automations.create({
          cron: input.cron,
          name: input.name,
          notifyOnFailure: input.notifyOnFailure,
          projectId: input.projectId,
          prompt: input.prompt,
          runtime: "codex",
          workspaceKind: "project",
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: scheduleQueryKeys.automations.all(),
      }),
  });
}

export function setAutomationEnabledMutationOptions({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({ enabled, id }: { enabled: boolean; id: string }) =>
      toRendererAutomation(
        enabled
          ? await getApiClient().automations.resume(id)
          : await getApiClient().automations.pause(id),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: scheduleQueryKeys.automations.all(),
      }),
  });
}

export function runAutomationNowMutationOptions({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (id: string) =>
      toRendererAutomation(await getApiClient().automations.runNow(id)),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: scheduleQueryKeys.automations.all(),
      }),
  });
}

export function deleteAutomationMutationOptions({
  queryClient,
}: {
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (id: string) => getApiClient().automations.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: scheduleQueryKeys.automations.all(),
      }),
  });
}

function toRendererAutomation(automation: DaemonAutomation): Automation {
  return {
    cron: automation.cron,
    enabled: automation.enabled,
    id: automation.id,
    name: automation.name,
    nextRunAt: automation.nextRunAt ?? undefined,
    notifyOnFailure: automation.notifyOnFailure,
    projectId: automation.projectId ?? undefined,
    prompt: automation.prompt,
    runs: automation.runs.map((run) => ({
      durationSeconds:
        run.finishedAt === null
          ? undefined
          : Math.max(
              0,
              Math.round(
                (new Date(run.finishedAt).getTime() -
                  new Date(run.startedAt).getTime()) /
                  1_000,
              ),
            ),
      error: run.error ?? undefined,
      id: run.id,
      startedAt: run.startedAt,
      status: run.status,
      trigger: run.trigger,
    })),
    status: automation.status,
  };
}
