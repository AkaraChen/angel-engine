import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";

import { isDaemonGlobalEvent } from "@angel-engine/daemon-api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useDaemonClient } from "@/platform/daemon";
import { queryKeys } from "@/platform/query-keys";

const RECONNECT_DELAY_MS = 1_000;

/**
 * Renderer-side subscription to the daemon's global event stream. The events
 * are invalidation hints only: every consumer still reads its state from the
 * matching `GET`, so a reconnect converges on the daemon snapshot rather than
 * on whatever the renderer accumulated while it was offline.
 *
 * The socket is opened from the daemon info directly instead of through
 * `daemon-client`, whose event URL resolves against `location.origin` — the
 * renderer is served from the app bundle, not from the daemon.
 */
export function DaemonEventSync() {
  const client = useDaemonClient();
  const queryClient = useQueryClient();
  const info = client?.info;

  useEffect(() => {
    if (info === undefined) return;

    let stopped = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const handleEvent = (event: DaemonGlobalEvent) => {
      switch (event.type) {
        case "chat-activity-changed":
        case "chat-attention-changed":
          void queryClient.invalidateQueries({
            queryKey: queryKeys.chatActivity.all(),
          });
          return;
        case "chat-metadata-changed":
          void queryClient.invalidateQueries({
            queryKey: queryKeys.chats.list(),
          });
      }
    };

    const connect = () => {
      const next = openDaemonEventSocket(info);
      socket = next;
      next.addEventListener("message", (message) => {
        let candidate: unknown;
        try {
          candidate = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (isDaemonGlobalEvent(candidate)) handleEvent(candidate);
      });
      next.addEventListener("open", () => {
        // The socket may have been down across daemon-side changes; resync.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chatActivity.all(),
        });
      });
      next.addEventListener("close", () => {
        if (stopped || socket !== next) return;
        socket = undefined;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socket?.close();
      socket = undefined;
    };
  }, [info, queryClient]);

  return null;
}

function openDaemonEventSocket(info: DaemonInfo): WebSocket {
  return new WebSocket(
    `ws://${info.host}:${info.port}/api/events`,
    `angel-engine-token.${info.token}`,
  );
}
