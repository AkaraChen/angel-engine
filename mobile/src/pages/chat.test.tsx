import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { stashNewChatPrompt } from "@/features/chat/new-chat-prompt";
import { DaemonProvider } from "@/platform/daemon-provider";

import { ChatPage } from "./chat";

interface SseHandle {
  response: Response;
  push: (event: unknown) => void;
  close: () => void;
}

function controllableSse(signal: AbortSignal | undefined): SseHandle {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  signal?.addEventListener("abort", () => {
    try {
      controller.error(new DOMException("aborted", "AbortError"));
    } catch {
      // already closed
    }
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    push: (event) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    close: () => controller.close(),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function renderChat(chatId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <AuthProvider>
      <DaemonProvider>
        <QueryClientProvider client={queryClient}>
          <ChatPage chatId={chatId} />
        </QueryClientProvider>
      </DaemonProvider>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("ChatPage", () => {
  it("renders a persisted transcript", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          chat: { id: "c1", title: "Greeting" },
          messages: [
            { id: "u1", role: "user", content: [{ type: "text", text: "hi" }] },
            {
              id: "a1",
              role: "assistant",
              content: [{ type: "text", text: "Hello!" }],
            },
          ],
        }),
      ),
    );

    renderChat("c1");

    expect(await screen.findByText("hi")).toBeDefined();
    expect(screen.getByText("Hello!")).toBeDefined();
  });

  it("sends a stashed new-chat prompt and streams the greet reply", async () => {
    let sse: SseHandle | undefined;
    let streamCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: { id: "new-chat", title: "New chat" },
          messages: [
            {
              id: "u1",
              role: "user",
              content: [{ type: "text", text: "hi" }],
            },
            {
              id: "a1",
              role: "assistant",
              content: [{ type: "text", text: "Hello!" }],
            },
          ],
        });
      }
      if (url.includes("/api/chat-streams?") && method === "POST") {
        streamCalls += 1;
        sse = controllableSse(init?.signal ?? undefined);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    stashNewChatPrompt("new-chat", "hi");

    renderChat("new-chat");

    // The optimistic user bubble is rendered while the turn is live.
    expect(await screen.findByText("hi")).toBeDefined();

    // Stream the assistant reply.
    await waitFor(() => expect(sse).toBeDefined());
    act(() => sse!.push({ type: "delta", part: "text", text: "Hello!" }));
    await waitFor(() => expect(screen.getByText("Hello!")).toBeDefined());

    act(() => {
      sse!.push({ type: "result", result: { text: "Hello!" } });
      sse!.push({ type: "done" });
      sse!.close();
    });

    // Once the turn completes, only one user bubble and one assistant bubble
    // remain — no duplicate initial message.
    await waitFor(() => {
      const userBubbles = screen.getAllByText("hi");
      expect(userBubbles).toHaveLength(1);
    });
    expect(screen.getAllByText("Hello!")).toHaveLength(1);
    expect(streamCalls).toBe(1);
  });

  it("shows the error state when the daemon is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("no daemon"))),
    );

    renderChat("c1");

    expect(await screen.findByText("Couldn't load this chat")).toBeDefined();
  });
});
