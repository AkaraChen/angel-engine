import type { AgentOption, CustomAgent } from "@angel-engine/daemon-api/agents";

import { createContext, use } from "react";

export interface AgentCatalog {
  availableAgentOptions: AgentOption[];
  customAgents: CustomAgent[];
}

export const AgentCatalogContext = createContext<AgentCatalog | null>(null);

export function useAgentCatalog() {
  const catalog = use(AgentCatalogContext);
  if (catalog === null) throw new Error("Agent catalog is unavailable.");
  return catalog;
}
