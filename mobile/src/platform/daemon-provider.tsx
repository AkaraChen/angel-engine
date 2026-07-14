import type { PropsWithChildren } from "react";
import type { DaemonClient } from "./daemon-client";

import { createContext, use, useMemo } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { LoginPage } from "@/features/auth/login-page";
import { createDaemonClient } from "./daemon-client";

const DaemonClientContext = createContext<DaemonClient | null>(null);

export function DaemonProvider({ children }: PropsWithChildren) {
  const { baseUrl, isAuthenticated, signOut, token } = useAuth();

  const client = useMemo(
    () =>
      createDaemonClient(
        { baseUrl, token },
        // A 401 means the paired token is stale (daemon restarted or the
        // password changed) — drop it and bounce back to the login screen.
        { onUnauthorized: signOut },
      ),
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
