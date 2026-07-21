import type { DaemonClient } from "@angel-engine/daemon-client";
import type { PropsWithChildren } from "react";

import { createDaemonClient } from "@angel-engine/daemon-client";
import { createContext, use, useMemo } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { LoginPage } from "@/features/auth/login-page";

const DaemonClientContext = createContext<DaemonClient | null>(null);

export function DaemonProvider({ children }: PropsWithChildren) {
  const { baseUrl, isAuthenticated, signOut, token } = useAuth();

  const client = useMemo(
    () =>
      // A 401 means the paired token is stale (daemon restarted or the
      // password changed) — drop it and bounce back to the login screen.
      createDaemonClient({ baseUrl, onUnauthorized: signOut, token }),
    [baseUrl, token, signOut],
  );

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <DaemonClientContext value={client}>{children}</DaemonClientContext>;
}

export function useDaemonClient(): DaemonClient {
  const client = use(DaemonClientContext);
  if (client === null) {
    throw new Error("useDaemonClient must be used within a DaemonProvider.");
  }
  return client;
}
