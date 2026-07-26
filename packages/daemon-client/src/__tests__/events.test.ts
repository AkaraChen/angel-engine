import { afterEach, describe, expect, it, vi } from "vitest";

import { createDaemonClient, DaemonRequestError } from "../index";

type SocketListener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Set<SocketListener>>();
  readonly protocol: string | string[] | undefined;
  readonly url: string;
  closed = false;

  constructor(url: string, protocol?: string | string[]) {
    this.url = url;
    this.protocol = protocol;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.closed = true;
    this.emit("close", {});
  }

  emit(type: string, event: { data?: unknown }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("daemon global events", () => {
  it("authenticates and forwards valid events without dying on future types", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const onEvent = vi.fn();
    const onInvalidEvent = vi.fn();
    const onOpen = vi.fn();
    const client = createDaemonClient({
      baseUrl: "https://daemon.test",
      token: "mobile-token",
    });

    const unsubscribe = client.events.subscribe({
      onEvent,
      onInvalidEvent,
      onOpen,
    });
    const socket = FakeWebSocket.instances[0];

    expect(socket?.url).toBe("wss://daemon.test/api/events");
    expect(socket?.protocol).toBe("angel-engine-token.mobile-token");
    socket?.emit("open", {});
    socket?.emit("message", {
      data: JSON.stringify({
        chatIds: ["chat-1"],
        type: "chat-activity-changed",
      }),
    });
    socket?.emit("message", {
      data: JSON.stringify({
        chatIds: ["chat-1"],
        type: "chat-conversation-changed",
      }),
    });
    socket?.emit("message", { data: JSON.stringify({ type: "future-event" }) });

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      chatIds: ["chat-1"],
      type: "chat-activity-changed",
    });
    expect(onEvent).toHaveBeenCalledWith({
      chatIds: ["chat-1"],
      type: "chat-conversation-changed",
    });
    expect(onInvalidEvent.mock.calls[0]?.[0]).toBeInstanceOf(
      DaemonRequestError,
    );
    expect(socket?.closed).toBe(false);

    unsubscribe();
  });

  it("closes a malformed JSON feed instead of hot-looping", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const onInvalidEvent = vi.fn();
    const client = createDaemonClient({
      baseUrl: "https://daemon.test",
      token: null,
    });

    client.events.subscribe({ onEvent: vi.fn(), onInvalidEvent });
    const socket = FakeWebSocket.instances[0];
    socket?.emit("message", { data: "{" });

    expect(onInvalidEvent.mock.calls[0]?.[0]).toBeInstanceOf(
      DaemonRequestError,
    );
    expect(socket?.closed).toBe(true);
  });
});
