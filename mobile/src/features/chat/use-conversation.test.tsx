import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";

import { stashNewChatPrompt } from "./new-chat-prompt";
import { useConversation } from "./use-conversation";

interface SseHandle {
  response: Response;
  push: (event: unknown) => void;
  close: () => void;
}

/** A live SSE stream whose events are pushed by the test; errors on abort. */
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
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <DaemonProvider>{children}</DaemonProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("useConversation", () => {
  it("loads and projects the persisted transcript", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chat: { id: "c1", title: "Fix bug" },
          messages: [
            { id: "u1", role: "user", content: [{ type: "text", text: "hi" }] },
            {
              id: "a1",
              role: "assistant",
              content: [{ type: "text", text: "hello" }],
            },
          ],
        }),
      ),
    );

    const { result } = renderHook(() => useConversation("c1"), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "hi"],
      ["assistant", "hello"],
    ]);
  });

  it("sends a stashed new-chat prompt as the first turn", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/chat-streams?") && init?.method === "POST") {
        sse = controllableSse(init.signal ?? undefined);
        return sse.response;
      }
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: { id: "new-chat", title: "New chat" },
          messages: [
            {
              id: "u1",
              role: "user",
              content: [{ type: "text", text: "start here" }],
            },
            {
              id: "a1",
              role: "assistant",
              content: [{ type: "text", text: "Started" }],
            },
          ],
        });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    stashNewChatPrompt("new-chat", "start here");

    const { result } = renderHook(() => useConversation("new-chat"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      text: "start here",
    });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      status: "streaming",
    });

    await waitFor(() => expect(sse).toBeDefined());
    const streamRequest = fetchMock.mock.calls.find(
      ([url]) => typeof url === "string" && url.includes("/api/chat-streams?"),
    );
    expect(streamRequest?.[1]?.body).toBe(
      JSON.stringify({ chatId: "new-chat", text: "start here" }),
    );
    act(() => sse!.push({ type: "delta", part: "text", text: "Started" }));
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.text).toBe("Started"),
    );

    act(() => {
      sse!.push({ type: "result", result: { text: "Started" } });
      sse!.push({ type: "done" });
      sse!.close();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(
      fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" && url.includes("/api/chat-streams?"),
      ),
    ).toHaveLength(1);
    expect(result.current.messages.map((message) => message.text)).toEqual([
      "start here",
      "Started",
    ]);
  });

  it("streams an assistant reply and reconciles with the daemon", async () => {
    let loadCalls = 0;
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        loadCalls += 1;
        // First load: empty. After the turn, the daemon has persisted it.
        return jsonResponse({
          chat: { id: "c1", title: "Fix bug" },
          messages:
            loadCalls === 1
              ? []
              : [
                  {
                    id: "u",
                    role: "user",
                    content: [{ type: "text", text: "hi" }],
                  },
                  {
                    id: "a",
                    role: "assistant",
                    content: [{ type: "text", text: "Hello" }],
                  },
                ],
        });
      }
      if (url.includes("/api/chat-streams?") && method === "POST") {
        sse = controllableSse(init?.signal ?? undefined);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("hi"));

    // The user message + an empty streaming assistant row (Thinking) appear.
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      text: "",
      status: "streaming",
    });

    await waitFor(() => expect(sse).toBeDefined());
    act(() => sse!.push({ type: "delta", part: "text", text: "Hello" }));
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.text).toBe("Hello"),
    );

    act(() => {
      sse!.push({ type: "result", result: { text: "Hello" } });
      sse!.push({ type: "done" });
      sse!.close();
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    await waitFor(() =>
      expect(result.current.messages.map((m) => [m.role, m.text])).toEqual([
        ["user", "hi"],
        ["assistant", "Hello"],
      ]),
    );
  });

  it("renders streamed tool calls and upserts them by id", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        return jsonResponse({ chat: { id: "c1", title: "c1" }, messages: [] });
      }
      if (url.includes("/api/chat-streams?") && method === "POST") {
        sse = controllableSse(init?.signal ?? undefined);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("run it"));
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    await waitFor(() => expect(sse).toBeDefined());

    // A `tool` event opens the card; the identifier is the action `kind`.
    act(() =>
      sse!.push({
        type: "tool",
        action: {
          id: "act-1",
          kind: "command",
          title: "Run command",
          phase: "running",
        },
      }),
    );
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.toolCalls).toMatchObject([
        {
          id: "act-1",
          name: "command",
          summary: "Run command",
          phase: "running",
        },
      ]),
    );

    // A `toolDelta` with the SAME id updates the existing card in place.
    act(() =>
      sse!.push({
        type: "toolDelta",
        action: {
          id: "act-1",
          kind: "command",
          title: "Run command",
          phase: "completed",
          outputText: "done",
        },
      }),
    );
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.toolCalls).toMatchObject([
        { id: "act-1", phase: "completed", outputText: "done" },
      ]),
    );
    // Upsert, not append: still exactly one tool call.
    expect(result.current.messages.at(-1)?.toolCalls).toHaveLength(1);

    act(() => {
      sse!.push({ type: "result", result: { text: "" } });
      sse!.push({ type: "done" });
      sse!.close();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it("resets the live turn and aborts the stream when the chat changes", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        const id = url.includes("c2") ? "c2" : "c1";
        return jsonResponse({ chat: { id, title: id }, messages: [] });
      }
      if (url.includes("/api/chat-streams?") && method === "POST") {
        sse = controllableSse(init?.signal ?? undefined);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ id }) => useConversation(id), {
      wrapper,
      initialProps: { id: "c1" },
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("hi"));
    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    rerender({ id: "c2" });

    // The in-flight turn is dropped and the composer is idle for the new chat.
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.messages.some((m) => m.status === "streaming")).toBe(
      false,
    );
    // The stream was cancelled server-side via DELETE /api/chat-streams/:id.
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/api/chat-streams/") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("surfaces an elicitation and resolves it so the turn continues", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load"))
        return jsonResponse({ chat: { id: "c1", title: "c1" }, messages: [] });
      if (url.includes("/api/chat-streams?") && method === "POST") {
        sse = controllableSse(init?.signal ?? undefined);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("hi"));
    await waitFor(() => expect(sse).toBeDefined());
    act(() =>
      sse!.push({
        type: "elicitation",
        elicitation: { id: "elic-1", kind: "Approval", title: "Run tests?" },
      }),
    );

    await waitFor(() =>
      expect(result.current.pendingElicitation?.id).toBe("elic-1"),
    );

    act(() => result.current.respondElicitation({ type: "allow" }));

    // The response is posted and the prompt clears.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => typeof url === "string" && url.endsWith("/elicitation"),
        ),
      ).toBe(true),
    );
    expect(result.current.pendingElicitation).toBeNull();

    act(() => {
      sse!.push({ type: "delta", part: "text", text: "Done" });
      sse!.push({ type: "done" });
      sse!.close();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it("stop finalizes the partial turn without an error bubble", async () => {
    let loadCalls = 0;
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        loadCalls += 1;
        return jsonResponse({
          chat: { id: "c1", title: "c1" },
          messages:
            loadCalls === 1
              ? []
              : [
                  {
                    id: "u",
                    role: "user",
                    content: [{ type: "text", text: "hi" }],
                  },
                  {
                    id: "a",
                    role: "assistant",
                    content: [{ type: "text", text: "Partial" }],
                  },
                ],
        });
      }
      if (url.includes("/api/chat-streams?") && method === "POST") {
        sse = controllableSse(init?.signal ?? undefined);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("hi"));
    await waitFor(() => expect(sse).toBeDefined());
    act(() => sse!.push({ type: "delta", part: "text", text: "Partial" }));
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.text).toBe("Partial"),
    );

    act(() => result.current.stop());

    // Stop is not a failure: no error bubble, and the partial reply is kept.
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.messages.some((m) => m.status === "error")).toBe(
      false,
    );
    await waitFor(() =>
      expect(result.current.messages.map((m) => [m.role, m.text])).toEqual([
        ["user", "hi"],
        ["assistant", "Partial"],
      ]),
    );
  });
});
