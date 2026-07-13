import type {
  TerminalApi,
  TerminalClientMessage,
  TerminalEvent,
} from "@angel-engine/daemon-api/terminal";
import { getDaemonTransport } from "./daemon-transport";

const sockets = new Map<string, WebSocket>();

export const terminalClient: TerminalApi = {
  create(input, onEvent) {
    const sessionId = input.sessionId ?? crypto.randomUUID();
    const socket = openSocket();
    sockets.set(sessionId, socket);
    socket.addEventListener("open", () =>
      send(socket, { ...input, sessionId, type: "create" }),
    );
    socket.addEventListener("message", (message) => {
      const payload = JSON.parse(String(message.data)) as {
        event: TerminalEvent;
        sessionId?: string;
      };
      if (payload.sessionId === undefined || payload.sessionId === sessionId)
        onEvent(payload.event);
    });
    socket.addEventListener("close", () => {
      if (sockets.get(sessionId) === socket) sockets.delete(sessionId);
    });
    return {
      dispose() {
        send(socket, { sessionId, type: "dispose" });
        socket.close();
      },
      kill() {
        send(socket, { sessionId, type: "kill" });
        socket.close();
      },
      resize(size) {
        send(socket, { ...size, sessionId, type: "resize" });
      },
      sessionId,
      write(data) {
        send(socket, { data, sessionId, type: "write" });
      },
    };
  },
  kill({ sessionId }) {
    const existing = sockets.get(sessionId);
    if (existing !== undefined) {
      send(existing, { sessionId, type: "kill" });
      existing.close();
      return;
    }
    const socket = openSocket();
    socket.addEventListener("open", () => {
      send(socket, { sessionId, type: "kill" });
      socket.close();
    });
  },
};

function openSocket() {
  const { info } = getDaemonTransport();
  return new WebSocket(
    `ws://${info.host}:${info.port}/api/terminals`,
    `angel-engine-token.${info.token}`,
  );
}

function send(socket: WebSocket, message: TerminalClientMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else if (socket.readyState === WebSocket.CONNECTING) {
    socket.addEventListener(
      "open",
      () => socket.send(JSON.stringify(message)),
      {
        once: true,
      },
    );
  }
}
