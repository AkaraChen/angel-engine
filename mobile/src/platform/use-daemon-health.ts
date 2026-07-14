import { useQuery } from "@tanstack/react-query";

import { useDaemonClient } from "./daemon-provider";
import { queryKeys } from "./query-keys";

/**
 * Smoke-test query that confirms the daemon connection and token are wired up.
 * Page sub-issues can follow this pattern for real data queries.
 */
export function useDaemonHealth() {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.daemon.health,
    queryFn: async () => daemon.health(),
  });
}
