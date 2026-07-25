import type { FC, PropsWithChildren } from "react";

import { isDaemonGlobalEvent } from "@angel-engine/daemon-api";
import { useEffect } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { applyChatRunAttentionEvent } from "./run-attention";

/**
 * Local in-app attention feed. It deliberately uses no push or relay service;
 * it observes the daemon's LAN WebSocket only while this app is running.
 */
export const ChatRunAttentionProvider: FC<PropsWithChildren> = ({
  children,
}) => {
  const { baseUrl, token } = useAuth();

  useEffect(() => {
    if (token === null || typeof WebSocket === "undefined") return;
    let disposed = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;

    const connect = () => {
      const url = new URL(
        "/api/events",
        baseUrl.length > 0 ? baseUrl : window.location.origin,
      );
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const next = new WebSocket(url, `angel-engine-token.${token}`);
      socket = next;
      next.addEventListener("message", (message) => {
        let event: unknown;
        try {
          event = JSON.parse(String(message.data));
        } catch {
          next.close(1002, "Invalid daemon event");
          return;
        }
        if (!isDaemonGlobalEvent(event)) {
          next.close(1002, "Invalid daemon event");
          return;
        }
        if (event.type === "chat-run") {
          applyChatRunAttentionEvent(
            event.chatId,
            event.runId,
            event.sequence,
            event.event,
          );
        }
      });
      next.addEventListener("close", () => {
        if (disposed || socket !== next) return;
        socket = undefined;
        reconnect = setTimeout(connect, 1_000);
      });
    };

    connect();
    return () => {
      disposed = true;
      if (reconnect !== undefined) clearTimeout(reconnect);
      socket?.close();
    };
  }, [baseUrl, token]);

  return children;
};
