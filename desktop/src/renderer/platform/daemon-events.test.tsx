// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/platform/query-keys";

import { DaemonEventSync } from "./daemon-events";

vi.mock("@/platform/daemon", () => ({
  useDaemonClient: () => ({
    info: { host: "127.0.0.1", port: 4242, token: "token" },
  }),
}));

/** Captures the listeners the sync registers so a test can replay a reconnect. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: () => void) {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  close() {}

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

afterEach(() => {
  cleanup();
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("daemonEventSync", () => {
  it("resyncs chat metadata as well as activity on reconnect", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <DaemonEventSync />
      </QueryClientProvider>,
    );

    const socket = FakeWebSocket.instances.at(0);
    expect(socket).toBeDefined();
    socket?.emit("open");

    const invalidatedKeys = invalidate.mock.calls.map(
      ([options]) => options?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(queryKeys.chatActivity.all());
    expect(invalidatedKeys).toContainEqual(queryKeys.chats.list());
  });
});
