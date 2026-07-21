import type { AgentCatalog } from "./agent-catalog-context";
import type { DaemonClient } from "@/platform/daemon";

import { createDaemonClient } from "@angel-engine/daemon-client";
import { use, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let catalogRevision = 0;
let resources = new WeakMap<DaemonClient, Promise<AgentCatalog>>();

export function useAgentCatalogResource(daemon: DaemonClient) {
  useSyncExternalStore(subscribe, getCatalogRevision, getCatalogRevision);
  return use(agentCatalogResource(daemon));
}

export function invalidateAgentCatalog() {
  resources = new WeakMap();
  catalogRevision += 1;
  for (const listener of listeners) listener();
}

// Returning the cached promise verbatim keeps React's Suspense resource stable.
// eslint-disable-next-line ts/promise-function-async
function agentCatalogResource(daemon: DaemonClient) {
  const existing = resources.get(daemon);
  if (existing !== undefined) return existing;
  const api = createDaemonClient({
    baseUrl: "",
    fetch: async (url, init) => daemon.fetch(url, init),
  });
  const resource = Promise.all([
    api.agents.listAvailable(),
    api.agents.listCustom(),
  ]).then(([availableAgentOptions, customAgents]) => ({
    availableAgentOptions,
    customAgents,
  }));
  resources.set(daemon, resource);
  return resource;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCatalogRevision() {
  return catalogRevision;
}
