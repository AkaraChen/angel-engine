import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";
import type { DaemonConnection } from "@shared/daemon";
import type { PropsWithChildren } from "react";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setDaemonTransport } from "./daemon-transport";

export interface DaemonClient {
  fetch: (pathname: string, init?: RequestInit) => Promise<Response>;
  info: DaemonInfo;
}

const DaemonClientContext = createContext<DaemonClient | null>(null);

export function DaemonProvider({ children }: PropsWithChildren) {
  const [connection, setConnection] = useState<DaemonConnection>({
    error: "Backend is starting.",
    status: "unavailable",
  });

  useEffect(() => {
    void window.daemon.getInfo().then(setConnection);
    return window.daemon.onChanged(setConnection);
  }, []);

  const client = useMemo(() => {
    if (connection.status !== "available") return null;
    const { info } = connection;
    return {
      async fetch(pathname: string, init: RequestInit = {}) {
        const headers = new Headers(init.headers);
        headers.set("authorization", `Bearer ${info.token}`);
        return fetch(`http://${info.host}:${info.port}${pathname}`, {
          ...init,
          headers,
        });
      },
      info,
    } satisfies DaemonClient;
  }, [connection]);

  setDaemonTransport(client ?? undefined);

  return (
    <DaemonClientContext.Provider value={client}>
      {connection.status === "unavailable" ? (
        <div
          className="
            fixed inset-x-0 top-0 z-100 bg-destructive px-3 py-1 text-center
            text-xs text-destructive-foreground
          "
        >
          Backend unavailable: {connection.error}
        </div>
      ) : null}
      {client === null ? null : children}
    </DaemonClientContext.Provider>
  );
}

export function useDaemonClient() {
  return useContext(DaemonClientContext);
}
