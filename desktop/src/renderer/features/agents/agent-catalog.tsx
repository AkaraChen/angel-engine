import type { PropsWithChildren } from "react";

import { useDaemonClient } from "@/platform/daemon";
import { AgentCatalogContext } from "./agent-catalog-context";
import { useAgentCatalogResource } from "./agent-catalog-resource";

export function AgentCatalogProvider({ children }: PropsWithChildren) {
  const daemon = useDaemonClient();
  if (daemon === null) throw new Error("Backend is unavailable.");
  const catalog = useAgentCatalogResource(daemon);

  return <AgentCatalogContext value={catalog}>{children}</AgentCatalogContext>;
}
