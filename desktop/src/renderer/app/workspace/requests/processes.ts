import type { ProcessRegistrySnapshotEntry } from "@angel-engine/daemon";
import type { QueryClient } from "@tanstack/react-query";
import type { DaemonClient } from "@/platform/daemon";

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { workspaceProcessQueryKeys } from "./keys";

export interface ProcessRegistrySnapshot {
  entries: ProcessRegistrySnapshotEntry[];
}

export function processRegistryQueryOptions({
  client,
  enabled = true,
}: {
  client: DaemonClient | null;
  enabled?: boolean;
}) {
  return queryOptions({
    enabled: enabled && client !== null,
    queryFn: async () => {
      if (client === null) throw new Error("Backend unavailable.");
      const response = await client.fetch("/api/process-registry");
      if (!response.ok) {
        throw new Error(`Process registry returned ${response.status}.`);
      }
      return (await response.json()) as ProcessRegistrySnapshot;
    },
    queryKey: workspaceProcessQueryKeys.registry(),
    refetchInterval: 2_500,
    staleTime: 2_000,
  });
}

export function killProcessMutationOptions({
  client,
  queryClient,
}: {
  client: DaemonClient;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({
      force = false,
      pid,
    }: {
      force?: boolean;
      pid: number;
    }) => {
      const response = await client.fetch(`/api/processes/${pid}/kill`, {
        body: JSON.stringify({ force }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok)
        throw new Error(`Kill process returned ${response.status}.`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workspaceProcessQueryKeys.all(),
      });
    },
  });
}
