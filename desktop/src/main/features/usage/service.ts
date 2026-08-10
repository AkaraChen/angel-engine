import { UsageCollector } from "@angel-engine/usage-collector";

const usageCollector = new UsageCollector();

export function getUsageSnapshot() {
  return usageCollector.collect();
}

export function refreshUsageSnapshot() {
  return usageCollector.collect({ force: true });
}
