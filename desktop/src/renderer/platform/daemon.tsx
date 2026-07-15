import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";
import type { DaemonConnection } from "@shared/daemon";
import type { PropsWithChildren } from "react";

import { createContext, useContext, useSyncExternalStore } from "react";
import { queryClient } from "@/app/query-client";
import { setDaemonTransport } from "./daemon-transport";

export interface DaemonClient {
  fetch: (pathname: string, init?: RequestInit) => Promise<Response>;
  info: DaemonInfo;
}

const DaemonClientContext = createContext<DaemonClient | null>(null);

// A routine daemon restart (e.g. after a mobile hosting change in settings)
// reconnects well within this window; only a persistent outage gets the notice.
const OUTAGE_NOTICE_DELAY_MS = 5_000;

interface DaemonSnapshot {
  // The last-known client. The daemon restarts in place when its config
  // changes; keep serving the previous client through the gap so the app stays
  // mounted instead of unmounting into an empty window.
  client: DaemonClient | null;
  connection: DaemonConnection;
  outageNoticeVisible: boolean;
}

function createClient(info: DaemonInfo): DaemonClient {
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
  };
}

let snapshot: DaemonSnapshot = {
  client: null,
  connection: { error: "Backend is starting.", status: "unavailable" },
  outageNoticeVisible: false,
};
const listeners = new Set<() => void>();
let subscribed = false;
let outageTimer: number | undefined;

function publish(next: DaemonSnapshot) {
  snapshot = next;
  setDaemonTransport(next.client ?? undefined);
  for (const listener of listeners) listener();
}

function showOutageNotice() {
  outageTimer = undefined;
  if (snapshot.connection.status === "available") return;
  publish({ ...snapshot, outageNoticeVisible: true });
}

function applyConnection(connection: DaemonConnection) {
  if (connection.status === "available") {
    if (outageTimer !== undefined) {
      window.clearTimeout(outageTimer);
      outageTimer = undefined;
    }
    const previous = snapshot.client?.info;
    publish({
      client: createClient(connection.info),
      connection,
      outageNoticeVisible: false,
    });
    if (
      previous !== undefined &&
      (previous.port !== connection.info.port ||
        previous.token !== connection.info.token)
    ) {
      // A restarted daemon is a fresh process on a new port/token — refetch
      // everything that failed or went stale while it was down.
      void queryClient.invalidateQueries();
    }
    return;
  }

  if (outageTimer === undefined) {
    outageTimer = window.setTimeout(showOutageNotice, OUTAGE_NOTICE_DELAY_MS);
  }
  publish({ ...snapshot, connection });
}

function subscribe(listener: () => void) {
  if (!subscribed) {
    subscribed = true;
    void window.daemon.getInfo().then(applyConnection);
    window.daemon.onChanged(applyConnection);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function DaemonProvider({ children }: PropsWithChildren) {
  const { client, connection, outageNoticeVisible } = useSyncExternalStore(
    subscribe,
    getSnapshot,
  );

  return (
    <DaemonClientContext.Provider value={client}>
      {connection.status === "unavailable" && outageNoticeVisible ? (
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
