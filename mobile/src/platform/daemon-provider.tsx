import type { PropsWithChildren } from "react";
import type { DaemonClient } from "./daemon-client";

import { createContext, use, useMemo } from "react";
import { createDaemonClient } from "./daemon-client";
import { resolveDaemonConfig } from "./daemon-config";

const DaemonClientContext = createContext<DaemonClient | null>(null);

export function DaemonProvider({ children }: PropsWithChildren) {
  const client = useMemo(() => createDaemonClient(resolveDaemonConfig()), []);
  return <DaemonClientContext value={client}>{children}</DaemonClientContext>;
}

export function useDaemonClient(): DaemonClient {
  const client = use(DaemonClientContext);
  if (client === null) {
    throw new Error("useDaemonClient must be used within a DaemonProvider.");
  }
  return client;
}
