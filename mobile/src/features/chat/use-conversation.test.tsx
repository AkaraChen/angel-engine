import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";
import type {
  ChatSendResult,
  ChatActiveRunSnapshot,
  ChatStreamEvent,
  DaemonChat,
  DaemonElicitation,
  DaemonToolAction,
} from "@/platform/chat-types";

import { readNewChatPrompt, stashNewChatPrompt } from "./new-chat-prompt";
import { useConversation } from "./use-conversation";

interface SseHandle {
  response: Response;
  push: (event: ChatStreamEvent) => void;
  close: () => void;
  fail: () => void;
}

function daemonChat(id = "c1"): DaemonChat {
  return {
    archived: false,
    createdAt: "2026-07-24T00:00:00.000Z",
    cwd: "/tmp",
    id,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: id,
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

function resultEvent(
  text: string,
  overrides: Partial<ChatSendResult> = {},
): ChatStreamEvent {
  const chat = overrides.chat ?? daemonChat(overrides.chatId);
  return {
    type: "result",
    result: {
      chat,
      chatId: chat.id,
      content: [],
      text,
      ...overrides,
    },
  };
}

function toolAction(
  overrides: Partial<DaemonToolAction> = {},
): DaemonToolAction {
  return {
    id: "act-1",
    turnId: "turn-1",
    kind: "command",
    phase: "running",
    title: "Run command",
    rawInput: "{}",
    output: [],
    outputText: "",
    ...overrides,
  };
}

function elicitation(
  overrides: Partial<DaemonElicitation> = {},
): DaemonElicitation {
  return {
    id: "elic-1",
    kind: "approval",
    phase: "open",
    title: "Allow?",
    ...overrides,
  };
}

/** A live SSE stream whose events are pushed by the test; errors on abort. */
function controllableSse(url: string, init?: RequestInit): SseHandle {
  const input = JSON.parse(requestBody(init)) as {
    chatId: string;
    text: string;
  };
  const runId = url.match(/\/api\/chat-runs\/([^/]+)$/)?.[1] ?? "test-run";
  return controllableObserverSse(
    activeRunSnapshot(input.chatId, input.text, runId),
    init?.signal ?? undefined,
  );
}

function activeRunSnapshot(
  chatId: string,
  text: string,
  runId = "test-run",
): ChatActiveRunSnapshot {
  const timestamp = "2026-07-25T00:00:00.000Z";
  return {
    assistantMessage: {
      content: [],
      createdAt: timestamp,
      id: `${runId}:assistant`,
      role: "assistant",
    },
    chatId,
    lastEventSequence: 0,
    pendingElicitation: null,
    runId,
    startedAt: timestamp,
    status: "running",
    updatedAt: timestamp,
    userMessage: {
      content: [{ text, type: "text" }],
      createdAt: timestamp,
      id: `${runId}:user`,
      role: "user",
    },
  };
}

function controllableObserverSse(
  snapshot: ChatActiveRunSnapshot,
  signal: AbortSignal | undefined,
): SseHandle {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let sequence = snapshot.lastEventSequence;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            snapshot,
            type: "snapshot",
          })}\n\n`,
        ),
      );
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
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            event,
            sequence: (sequence += 1),
            type: "event",
          })}\n\n`,
        ),
      ),
    close: () => controller.close(),
    fail: () => controller.error(new TypeError("network disconnected")),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(init?: RequestInit): string {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return init.body;
}

function wrapper({ children }: PropsWithChildren) {
  const testFetch = globalThis.fetch as typeof fetch & {
    activeRunFallback?: boolean;
    handlesActiveRun?: boolean;
  };
  if (testFetch.activeRunFallback !== true) {
    const withActiveRunFallback = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith("/active-run") && testFetch.handlesActiveRun !== true) {
        return jsonResponse({ run: null });
      }
      return testFetch(input, init);
    }) as typeof testFetch;
    withActiveRunFallback.activeRunFallback = true;
    vi.stubGlobal("fetch", withActiveRunFallback);
  }
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
    let loadCalls = 0;
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      if (url.endsWith("/load")) {
        loadCalls += 1;
        return jsonResponse({
          chat: { id: "new-chat", title: "New chat" },
          messages:
            loadCalls === 1
              ? []
              : [
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
    // The prompt is consumed when the auto-send starts so it cannot be resent.
    expect(readNewChatPrompt("new-chat")).toBeUndefined();
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
      ([url]) =>
        typeof url === "string" &&
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation"),
    );
    expect(streamRequest?.[1]?.body).toBe(
      JSON.stringify({ chatId: "new-chat", text: "start here" }),
    );
    act(() => sse!.push({ type: "delta", part: "text", text: "Started" }));
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.text).toBe("Started"),
    );

    act(() => {
      sse!.push(resultEvent("Started", { chat: daemonChat("new-chat") }));
      sse!.push({ type: "done" });
      sse!.close();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(
      fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/chat-runs/") &&
          !url.endsWith("/elicitation"),
      ),
    ).toHaveLength(1);
    expect(result.current.messages.map((message) => message.text)).toEqual([
      "start here",
      "Started",
    ]);
  });

  it("does not resend a stashed prompt when the hook remounts before the send fires", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: { id: "remount-chat", title: "Remount chat" },
          messages: [],
        });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    stashNewChatPrompt("remount-chat", "start here");

    // First render schedules the deferred auto-send; unmount before it fires.
    const { unmount } = renderHook(() => useConversation("remount-chat"), {
      wrapper,
    });
    unmount();

    // A StrictMode-style remount should still send exactly once.
    const { result } = renderHook(() => useConversation("remount-chat"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    await waitFor(() => expect(sse).toBeDefined());
    expect(
      fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/chat-runs/") &&
          !url.endsWith("/elicitation"),
      ),
    ).toHaveLength(1);
    expect(readNewChatPrompt("remount-chat")).toBeUndefined();
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
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      if (url.includes("/api/chat-runs/") && method === "DELETE") {
        queueMicrotask(() => {
          sse?.push({ type: "done" });
          sse?.close();
        });
        return jsonResponse({ ok: true });
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
      sse!.push(resultEvent("Hello"));
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
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
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
        action: toolAction({
          id: "act-1",
          kind: "command",
          title: "Run command",
          phase: "running",
          rawInput: '{"command":"npm test"}',
        }),
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
        action: toolAction({
          id: "act-1",
          kind: "command",
          title: "Run command",
          phase: "completed",
          outputText: "done",
          rawInput: '{"command":"npm test"}',
        }),
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
      sse!.push(resultEvent(""));
      sse!.push({ type: "done" });
      sse!.close();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it("keeps streamed text when a result event omits the final text", async () => {
    let sse: SseHandle | undefined;
    let loadCalls = 0;
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
                    content: [{ type: "text", text: "run it" }],
                  },
                  {
                    id: "a",
                    role: "assistant",
                    content: [{ type: "text", text: "Done." }],
                  },
                ],
        });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("run it"));
    await waitFor(() => expect(sse).toBeDefined());

    act(() => sse!.push({ type: "delta", part: "text", text: "Done." }));
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.text).toBe("Done."),
    );

    act(() => {
      sse!.push(resultEvent(""));
      sse!.push({ type: "done" });
      sse!.close();
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.messages.at(-1)?.text).toBe("Done.");
  });

  it("does not duplicate a canonical turn while retaining its error bubble", async () => {
    let loadCalls = 0;
    let runId: string | undefined;
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
                    id: "previous-user",
                    role: "user",
                    content: [{ type: "text", text: "before" }],
                  },
                  {
                    id: "previous-assistant",
                    role: "assistant",
                    content: [{ type: "text", text: "Earlier reply" }],
                  },
                  {
                    id: `${runId}:user`,
                    role: "user",
                    content: [{ type: "text", text: "hi" }],
                  },
                  {
                    id: `${runId}:assistant`,
                    role: "assistant",
                    content: [{ type: "text", text: "Partial" }],
                  },
                ],
        });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        runId = url.match(/\/api\/chat-runs\/([^/]+)$/)?.[1];
        sse = controllableSse(url, init);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("hi"));
    await waitFor(() => expect(sse).toBeDefined());
    act(() => {
      sse!.push({ type: "delta", part: "text", text: "Partial" });
      sse!.push({ type: "error", message: "Provider failed" });
      sse!.push({ type: "done" });
      sse!.close();
    });

    await waitFor(() =>
      expect(
        result.current.messages.some(({ id }) => id === "previous-user"),
      ).toBe(true),
    );
    expect(result.current.messages).toHaveLength(4);
    expect(
      result.current.messages.filter(
        ({ id }) => id === `${runId}:user` || id === `${runId}:assistant`,
      ),
    ).toHaveLength(2);
    expect(result.current.messages.at(-1)).toMatchObject({
      error: "Provider failed",
      id: `${runId}:assistant`,
      status: "error",
    });
  });

  it("detaches the observer without stopping the run when the chat changes", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        const id = url.includes("c2") ? "c2" : "c1";
        return jsonResponse({ chat: { id, title: id }, messages: [] });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
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

    act(() =>
      sse!.push({
        elicitation: elicitation({
          id: "elic-switch",
          kind: "approval",
          title: "Allow the command?",
        }),
        type: "elicitation",
      }),
    );
    await waitFor(() =>
      expect(result.current.pendingElicitation?.id).toBe("elic-switch"),
    );

    rerender({ id: "c2" });

    // The old chat's observer is detached and its local presentation is
    // dropped, leaving the newly selected chat idle.
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.pendingElicitation).toBeNull();
    expect(result.current.messages.some((m) => m.status === "streaming")).toBe(
      false,
    );
    // Chat switching must never invoke the explicit Stop route.
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/api/chat-runs/") &&
          init?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("reattaches after a lock-screen lifecycle without stopping the run", async () => {
    const baseSnapshot = activeRunSnapshot("c1", "hi", "run-lock");
    const snapshot: ChatActiveRunSnapshot = {
      ...baseSnapshot,
      assistantMessage: {
        ...baseSnapshot.assistantMessage,
        content: [{ text: "Working", type: "text" }],
      },
      lastEventSequence: 1,
      updatedAt: "2026-07-25T00:00:01.000Z",
    };
    const observers: SseHandle[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/active-run")) {
        return jsonResponse({ run: snapshot });
      }
      if (url.endsWith("/load")) {
        return jsonResponse({ chat: { id: "c1", title: "c1" }, messages: [] });
      }
      if (url.endsWith("/events") && method === "GET") {
        const observer = controllableObserverSse(
          snapshot,
          init?.signal ?? undefined,
        );
        observers.push(observer);
        return observer.response;
      }
      return jsonResponse({ ok: true });
    });
    Object.assign(fetchMock, { handlesActiveRun: true });
    vi.stubGlobal("fetch", fetchMock);

    const first = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(first.result.current.isStreaming).toBe(true));
    expect(first.result.current.messages.at(-1)?.text).toBe("Working");
    expect(observers).toHaveLength(1);

    first.unmount();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/api/chat-runs/") &&
          init?.method === "DELETE",
      ),
    ).toBe(false);

    const resumed = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(observers).toHaveLength(2));
    await waitFor(() => expect(resumed.result.current.isStreaming).toBe(true));
    expect(resumed.result.current.messages.at(-1)?.text).toBe("Working");

    act(() => observers[1].push({ part: "text", text: "!", type: "delta" }));
    await waitFor(() =>
      expect(resumed.result.current.messages.at(-1)?.text).toBe("Working!"),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/api/chat-runs/") &&
          init?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("reattaches from the active snapshot after temporary network loss", async () => {
    let snapshot: ChatActiveRunSnapshot | null = null;
    let firstObserver: SseHandle | undefined;
    let reattachedObserver: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/active-run")) {
        return jsonResponse({ run: snapshot });
      }
      if (url.endsWith("/load")) {
        return jsonResponse({ chat: { id: "c1", title: "c1" }, messages: [] });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/events") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        const input = JSON.parse(requestBody(init)) as {
          chatId: string;
          text: string;
        };
        const runId = url.split("/").at(-1) ?? "run-1";
        snapshot = activeRunSnapshot(input.chatId, input.text, runId);
        firstObserver = controllableObserverSse(
          snapshot,
          init?.signal ?? undefined,
        );
        return firstObserver.response;
      }
      if (url.endsWith("/events") && method === "GET" && snapshot !== null) {
        reattachedObserver = controllableObserverSse(
          snapshot,
          init?.signal ?? undefined,
        );
        return reattachedObserver.response;
      }
      return jsonResponse({ ok: true });
    });
    Object.assign(fetchMock, { handlesActiveRun: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    act(() => result.current.send("hi"));
    await waitFor(() => expect(firstObserver).toBeDefined());

    act(() =>
      firstObserver!.push({ part: "text", text: "Working", type: "delta" }),
    );
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.text).toBe("Working"),
    );
    snapshot = {
      ...snapshot!,
      assistantMessage: {
        ...snapshot!.assistantMessage,
        content: [{ text: "Working", type: "text" }],
      },
      lastEventSequence: 1,
      updatedAt: "2026-07-25T00:00:01.000Z",
    };

    act(() => firstObserver!.fail());
    await waitFor(() => expect(reattachedObserver).toBeDefined());
    expect(result.current.isStreaming).toBe(true);

    act(() =>
      reattachedObserver!.push({
        part: "text",
        text: "!",
        type: "delta",
      }),
    );
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.text).toBe("Working!"),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes("/api/chat-runs/") &&
          init?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("surfaces an elicitation and resolves it so the turn continues", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load"))
        return jsonResponse({ chat: { id: "c1", title: "c1" }, messages: [] });
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
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
        elicitation: elicitation({
          id: "elic-1",
          kind: "approval",
          title: "Run tests?",
        }),
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

  it("rolls plan chip back when ExitPlanMode resolve fails", async () => {
    let sse: SseHandle | undefined;
    const modes = [
      { label: "Plan", value: "plan" },
      { label: "Default", value: "default" },
    ];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: { id: "c1", title: "c1" },
          messages: [],
          config: {
            canSetPermissionMode: true,
            currentPermissionMode: "plan",
            permissionModes: modes,
            models: [],
            reasoningEfforts: [],
          },
        });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      if (url.endsWith("/elicitation") && method === "POST") {
        return new Response(JSON.stringify({ message: "offline" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.send("plan then implement"));
    await waitFor(() => expect(sse).toBeDefined());
    act(() =>
      sse!.push({
        type: "elicitation",
        elicitation: elicitation({
          id: "exit-1",
          kind: "approval",
          title: "Allow ExitPlanMode?",
        }),
      }),
    );
    await waitFor(() =>
      expect(result.current.pendingElicitation?.id).toBe("exit-1"),
    );

    act(() => result.current.respondElicitation({ type: "allow" }));
    // Optimistic patch applied immediately…
    expect(result.current.runtimeConfig?.currentPermissionMode).toBe("default");

    // …then rolled back when resolve fails, with elicitation restored.
    await waitFor(() =>
      expect(result.current.runtimeConfig?.currentPermissionMode).toBe("plan"),
    );
    await waitFor(() =>
      expect(result.current.pendingElicitation?.id).toBe("exit-1"),
    );
  });

  it("switches the plan chip to build as soon as ExitPlanMode is allowed", async () => {
    let sse: SseHandle | undefined;
    const modes = [
      { label: "Plan", value: "plan" },
      { label: "Default", value: "default" },
    ];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: { id: "c1", title: "c1" },
          messages: [],
          config: {
            canSetPermissionMode: true,
            currentPermissionMode: "plan",
            permissionModes: modes,
            models: [],
            reasoningEfforts: [],
          },
        });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      // Keep setPermissionMode pending forever if called — UI must not wait.
      if (url.endsWith("/permission-mode") && method === "PUT") {
        return await new Promise<Response>(() => {});
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.runtimeConfig?.currentPermissionMode).toBe("plan");

    act(() => result.current.send("plan then implement"));
    await waitFor(() => expect(sse).toBeDefined());
    act(() =>
      sse!.push({
        type: "elicitation",
        elicitation: elicitation({
          id: "exit-1",
          kind: "approval",
          title: "Allow ExitPlanMode?",
        }),
      }),
    );
    await waitFor(() =>
      expect(result.current.pendingElicitation?.id).toBe("exit-1"),
    );

    act(() => result.current.respondElicitation({ type: "allow" }));

    // Chip must leave Plan before the turn result (next Bash may elicit next).
    expect(result.current.runtimeConfig?.currentPermissionMode).toBe("default");

    act(() =>
      sse!.push({
        type: "elicitation",
        elicitation: elicitation({
          id: "bash-1",
          kind: "approval",
          title: "Allow Bash?",
        }),
      }),
    );
    await waitFor(() =>
      expect(result.current.pendingElicitation?.id).toBe("bash-1"),
    );
    // Still build while the next elicitation is open and no result yet.
    expect(result.current.runtimeConfig?.currentPermissionMode).toBe("default");
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
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      if (url.includes("/api/chat-runs/") && method === "DELETE") {
        queueMicrotask(() => {
          sse?.push({ type: "done" });
          sse?.close();
        });
        return jsonResponse({ ok: true });
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

  it("streams plan events, sends permissionMode, and updates mode via API", async () => {
    let sse: SseHandle | undefined;
    let permissionMode = "plan";
    const config = () => ({
      canSetPermissionMode: true,
      currentPermissionMode: permissionMode,
      permissionModes: [
        { label: "Plan", value: "plan" },
        { label: "Default", value: "default" },
      ],
      models: [],
      reasoningEfforts: [],
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: { id: "c1", title: "c1" },
          messages: [],
          config: config(),
        });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      if (url.endsWith("/permission-mode") && method === "PUT") {
        const rawBody = typeof init?.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as { mode?: string };
        permissionMode = body.mode ?? permissionMode;
        return jsonResponse({
          chat: { id: "c1", title: "c1" },
          config: config(),
        });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.runtimeConfig?.currentPermissionMode).toBe("plan");

    act(() => result.current.send("make a plan"));
    await waitFor(() => expect(sse).toBeDefined());
    const streamRequest = fetchMock.mock.calls.find(
      ([url]) =>
        typeof url === "string" &&
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation"),
    );
    expect(streamRequest?.[1]?.body).toBe(
      JSON.stringify({
        chatId: "c1",
        text: "make a plan",
        permissionMode: "plan",
      }),
    );

    act(() =>
      sse!.push({
        type: "plan",
        plan: {
          text: "Step one",
          entries: [{ content: "Toggle", status: "pending" }],
          kind: "review",
        },
      }),
    );
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.plans[0]?.text).toBe("Step one"),
    );

    act(() => {
      sse!.push(resultEvent("Here is the plan."));
      sse!.push({ type: "done" });
      sse!.close();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    await act(async () => {
      await result.current.setPermissionMode("default");
    });
    await waitFor(() =>
      expect(result.current.runtimeConfig?.currentPermissionMode).toBe(
        "default",
      ),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/permission-mode") &&
          init?.method === "PUT",
      ),
    ).toBe(true);
  });

  it("keeps a late mode mutation on the original chat after a switch", async () => {
    let resolveMode: ((response: Response) => void) | undefined;
    let c1PermissionMode = "plan";
    const modes = [
      { label: "Plan", value: "plan" },
      { label: "Accept edits", value: "acceptEdits" },
      { label: "Default", value: "default" },
    ];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (
        typeof url === "string" &&
        url.includes("/c1/") &&
        url.endsWith("/load")
      ) {
        return jsonResponse({
          chat: { id: "c1", title: "c1" },
          messages: [],
          config: {
            canSetPermissionMode: true,
            currentPermissionMode: c1PermissionMode,
            permissionModes: modes,
            models: [],
            reasoningEfforts: [],
          },
        });
      }
      if (
        typeof url === "string" &&
        url.includes("/c2/") &&
        url.endsWith("/load")
      ) {
        return jsonResponse({
          chat: { id: "c2", title: "c2" },
          messages: [],
          config: {
            canSetPermissionMode: true,
            currentPermissionMode: "default",
            permissionModes: modes,
            models: [],
            reasoningEfforts: [],
          },
        });
      }
      if (
        typeof url === "string" &&
        url.includes("/c1/") &&
        url.endsWith("/permission-mode") &&
        method === "PUT"
      ) {
        return await new Promise<Response>((resolve) => {
          resolveMode = resolve;
        });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ id }) => useConversation(id), {
      wrapper,
      initialProps: { id: "c1" },
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.runtimeConfig?.currentPermissionMode).toBe("plan");

    let modePromise!: Promise<void>;
    act(() => {
      // Distinct from c2's `default` so a wrong-chat cache write fails loudly.
      modePromise = result.current.setPermissionMode("acceptEdits");
    });
    await waitFor(() => expect(resolveMode).toBeDefined());

    // Switch chats while the mode request for c1 is still in flight.
    rerender({ id: "c2" });
    await waitFor(() =>
      expect(result.current.runtimeConfig?.currentPermissionMode).toBe(
        "default",
      ),
    );

    act(() => {
      c1PermissionMode = "acceptEdits";
      resolveMode!(
        jsonResponse({
          chat: { id: "c1", title: "c1" },
          config: {
            canSetPermissionMode: true,
            currentPermissionMode: "acceptEdits",
            permissionModes: modes,
            models: [],
            reasoningEfforts: [],
          },
        }),
      );
    });
    await act(async () => {
      await modePromise;
    });

    // c2 must stay on its own load config — not acceptEdits from c1's response.
    expect(result.current.runtimeConfig?.currentPermissionMode).toBe("default");

    // Switching back surfaces the late c1 update in c1's cache only.
    rerender({ id: "c1" });
    await waitFor(() =>
      expect(result.current.runtimeConfig?.currentPermissionMode).toBe(
        "acceptEdits",
      ),
    );
  });

  it("collapses persisted plans when a live plan of the same kind streams in", async () => {
    let sse: SseHandle | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: { id: "c1", title: "c1" },
          messages: [
            {
              id: "a0",
              role: "assistant",
              content: [
                {
                  type: "data",
                  name: "plan",
                  data: {
                    text: "Old plan",
                    entries: [],
                    kind: "review",
                  },
                },
              ],
            },
          ],
        });
      }
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        sse = controllableSse(url, init);
        return sse.response;
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.messages[0]?.plans[0]?.presentation).toBeNull();

    act(() => result.current.send("revise"));
    await waitFor(() => expect(sse).toBeDefined());
    act(() =>
      sse!.push({
        type: "plan",
        plan: { text: "New plan", entries: [], kind: "review" },
      }),
    );
    await waitFor(() => {
      const plans = result.current.messages.flatMap((m) => m.plans);
      expect(plans).toHaveLength(2);
      expect(plans[0].presentation).toBe("created");
      expect(plans[0].text).toBe("Old plan");
      expect(plans[1].presentation).toBeNull();
      expect(plans[1].text).toBe("New plan");
    });
  });
});
