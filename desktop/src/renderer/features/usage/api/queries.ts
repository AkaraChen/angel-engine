import { queryOptions } from "@tanstack/react-query";
import type { UsageAvailability } from "@angel-engine/usage-collector/types";
import i18n from "i18next";
import { queryKeys } from "@/platform/query-keys";

async function invokeUsage(
  method: "usageGetSnapshot" | "usageRefresh",
): Promise<UsageAvailability> {
  if (!window.tipc) {
    return {
      detail: i18n.t("common.backendUnavailable"),
      kind: "unavailable",
      reason: "exec-failed",
    };
  }
  const { ipc } = await import("@/platform/ipc");
  return ipc[method]();
}

export function refreshUsageSnapshot() {
  return invokeUsage("usageRefresh");
}

export function usageSnapshotQueryOptions() {
  return queryOptions({
    queryFn: () => invokeUsage("usageGetSnapshot"),
    queryKey: queryKeys.usage.snapshot(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}
