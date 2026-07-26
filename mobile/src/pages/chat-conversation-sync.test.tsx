import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonEventSync } from "@/platform/daemon-events";
import { DaemonProvider } from "@/platform/daemon-provider";

import { ChatPage } from "./chat";

const TOKEN_STORAGE_KEY = "angel-engine.mobile.session-token";

type SocketListener = (event: { data?: unknown }) => void;

/** Stands in for the daemon's global event socket so a test can push hints. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private readonly listeners = new Map<string, Set<SocketListener>>();

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener) {
    const existing = this.listeners.get(type) ?? new Set<SocketListener>();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  close() {}

  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("mobile conversation push sync", () => {
  it("re-probes the active run when the daemon reports a conversation change", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "session-token");
    vi.stubGlobal("WebSocket", FakeWebSocket);

    let activeRunCalls = 0;
    vi.stubGlobal("fetch", (input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.endsWith("/active-run")) {
        activeRunCalls += 1;
        return Promise.resolve(jsonResponse({ run: null }));
      }
      if (url.endsWith("/load")) {
        return Promise.resolve(
          jsonResponse({
            chat: { id: "c1", title: "Greeting" },
            messages: [
              {
                content: [{ text: "hi", type: "text" }],
                id: "u1",
                role: "user",
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <AuthProvider>
        <DaemonProvider>
          <QueryClientProvider client={queryClient}>
            <DaemonEventSync />
            <ChatPage chatId="c1" />
          </QueryClientProvider>
        </DaemonProvider>
      </AuthProvider>,
    );

    expect(await screen.findByText("hi")).toBeDefined();
    // The mount probe found no run. Before this change that was the end of the
    // story — the loop returned and never looked again.
    await waitFor(() => expect(activeRunCalls).toBe(1));

    FakeWebSocket.instances.at(0)?.emit("message", {
      data: JSON.stringify({
        chatIds: ["c1"],
        type: "chat-conversation-changed",
      }),
    });

    await waitFor(() => expect(activeRunCalls).toBe(2));
  });

  it("ignores a conversation change for a different chat", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "session-token");
    vi.stubGlobal("WebSocket", FakeWebSocket);

    let activeRunCalls = 0;
    vi.stubGlobal("fetch", (input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.endsWith("/active-run")) {
        activeRunCalls += 1;
        return Promise.resolve(jsonResponse({ run: null }));
      }
      if (url.endsWith("/load")) {
        return Promise.resolve(
          jsonResponse({
            chat: { id: "c1", title: "Greeting" },
            messages: [
              {
                content: [{ text: "hi", type: "text" }],
                id: "u1",
                role: "user",
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <AuthProvider>
        <DaemonProvider>
          <QueryClientProvider client={queryClient}>
            <DaemonEventSync />
            <ChatPage chatId="c1" />
          </QueryClientProvider>
        </DaemonProvider>
      </AuthProvider>,
    );

    expect(await screen.findByText("hi")).toBeDefined();
    await waitFor(() => expect(activeRunCalls).toBe(1));

    FakeWebSocket.instances.at(0)?.emit("message", {
      data: JSON.stringify({
        chatIds: ["other-chat"],
        type: "chat-conversation-changed",
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(activeRunCalls).toBe(1);
  });
});
