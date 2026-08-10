// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/platform/query-keys";
import { scheduleQueryKeys } from "@/features/schedule/requests/keys";

import { DaemonEventSync } from "./daemon-events";

vi.mock("@/platform/daemon", () => ({
  useDaemonClient: () => ({
    info: { host: "127.0.0.1", port: 4242, token: "token" },
  }),
}));

// Mocked rather than exercised: the reconcile pulls in the whole chat run store
// (and through it the tipc bridge). Its own behaviour is covered by
// features/chat/state/__tests__/chat-run-continuity.test.ts; here we only care
// that socket events reach it.
const reconcileChatConversation =
  vi.fn<(chatId: string, client: unknown) => void>();
const mountedChatIds = vi.fn<() => string[]>(() => []);
vi.mock("@/features/chat/state/chat-conversation-sync", () => ({
  mountedChatIds: (): string[] => mountedChatIds(),
  reconcileChatConversation: (chatId: string, client: unknown): void => {
    reconcileChatConversation(chatId, client);
  },
}));

/** The chat ids the reconcile was asked about, in call order. */
function reconciledChatIds(): string[] {
  return reconcileChatConversation.mock.calls.map(([chatId]) => chatId);
}

/** Captures the listeners the sync registers so a test can replay a reconnect. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private readonly listeners = new Map<
    string,
    Set<(event: { data?: unknown }) => void>
  >();

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: { data?: unknown }) => void,
  ) {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  close() {}

  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  reconcileChatConversation.mockClear();
  mountedChatIds.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(invalidatedKeys).toContainEqual(queryKeys.chats.archived());
  });

  it("reconciles every mounted chat on reconnect, since hints are not replayed", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    mountedChatIds.mockReturnValue(["chat-a", "chat-b"]);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <DaemonEventSync />
      </QueryClientProvider>,
    );
    FakeWebSocket.instances.at(0)?.emit("open");
    vi.advanceTimersByTime(200);

    expect(reconciledChatIds()).toEqual(["chat-a", "chat-b"]);
  });

  it("coalesces a burst of conversation hints into one reconcile per chat", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <DaemonEventSync />
      </QueryClientProvider>,
    );
    const socket = FakeWebSocket.instances.at(0);
    const hint = (chatIds: string[]) => ({
      data: JSON.stringify({ chatIds, type: "chat-conversation-changed" }),
    });
    // A single turn publishes on start and on settle, and the originating window
    // gets its own echo — three hints, one reconcile.
    socket?.emit("message", hint(["chat-a"]));
    socket?.emit("message", hint(["chat-a"]));
    socket?.emit("message", hint(["chat-a", "chat-b"]));

    expect(reconcileChatConversation).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);

    expect(reconciledChatIds()).toEqual(["chat-a", "chat-b"]);
  });

  it("invalidates automation state when the daemon publishes a change", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <DaemonEventSync />
      </QueryClientProvider>,
    );
    FakeWebSocket.instances.at(0)?.emit("message", {
      data: JSON.stringify({
        automationIds: ["automation-1"],
        type: "automations-changed",
      }),
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: scheduleQueryKeys.automations.all(),
    });
  });

  it("invalidates shepherd sessions when the daemon publishes a change", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <DaemonEventSync />
      </QueryClientProvider>,
    );
    FakeWebSocket.instances.at(0)?.emit("message", {
      data: JSON.stringify({
        chatIds: ["chat-a", "chat-b"],
        type: "shepherd-changed",
      }),
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.shepherd.session("chat-a"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.shepherd.session("chat-b"),
    });
  });
});
