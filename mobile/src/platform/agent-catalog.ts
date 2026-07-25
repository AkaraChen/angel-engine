import { AGENT_OPTIONS } from "@angel-engine/daemon-api/agents";

/** Shared built-in labels for existing chat rows; creation options come from the daemon. */
export function agentLabel(runtime: string | null | undefined): string {
  if (runtime === null || runtime === undefined || runtime.length === 0) {
    return "Agent";
  }
  return AGENT_OPTIONS.find((agent) => agent.id === runtime)?.label ?? runtime;
}
