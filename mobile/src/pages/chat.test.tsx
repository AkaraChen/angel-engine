import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { stashNewChatPrompt } from "@/features/chat/new-chat-prompt";
import { DaemonProvider } from "@/platform/daemon-provider";
import type {
  ChatSendResult,
  ChatStreamEvent,
  DaemonChat,
  DaemonToolAction,
} from "@/platform/chat-types";

import { ChatPage } from "./chat";

interface SseHandle {
  response: Response;
  push: (event: ChatStreamEvent) => void;
  close: () => void;
}

function daemonChat(id: string): DaemonChat {
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
  chatId: string,
  text: string,
  overrides: Partial<ChatSendResult> = {},
): ChatStreamEvent {
  const chat = overrides.chat ?? daemonChat(chatId);
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
    id: "t1",
    turnId: "turn-1",
    kind: "command",
    phase: "running",
    title: "Run command",
    rawInput: '{"command":"ls"}',
    output: [],
    outputText: "",
    ...overrides,
  };
}

function controllableSse(url: string, init?: RequestInit): SseHandle {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let sequence = 0;
  const input = JSON.parse(requestBody(init)) as {
    chatId: string;
    text: string;
  };
  const runId = url.match(/\/api\/chat-runs\/([^/]+)$/)?.[1] ?? "test-run";
  const timestamp = "2026-07-25T00:00:00.000Z";
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            snapshot: {
              assistantMessage: {
                content: [],
                createdAt: timestamp,
                id: `${runId}:assistant`,
                role: "assistant",
              },
              chatId: input.chatId,
              lastEventSequence: 0,
              pendingElicitation: null,
              runId,
              startedAt: timestamp,
              status: "running",
              updatedAt: timestamp,
              userMessage: {
                content: [{ text: input.text, type: "text" }],
                createdAt: timestamp,
                id: `${runId}:user`,
                role: "user",
              },
            },
            type: "snapshot",
          })}\n\n`,
        ),
      );
    },
  });
  init?.signal?.addEventListener("abort", () => {
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
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function requestBody(init?: RequestInit): string {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return init.body;
}

function renderChat(chatId: string) {
  const testFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return url.endsWith("/active-run")
        ? Promise.resolve(jsonResponse({ run: null }))
        : testFetch(input, init);
    },
  );
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

  it("renders assistant markdown with headings, lists and inline code", async () => {
    const markdown = "# Title\n\n- First\n- Second\n\nUse `code` here.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          chat: { id: "md", title: "Markdown" },
          messages: [
            {
              id: "u1",
              role: "user",
              content: [{ type: "text", text: "format please" }],
            },
            {
              id: "a1",
              role: "assistant",
              content: [{ type: "text", text: markdown }],
            },
          ],
        }),
      ),
    );

    renderChat("md");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Title" })).toBeDefined();
    });
    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
    expect(
      screen.getByText((content, element) => {
        const el = element as Element | null;
        return content === "code" && el?.tagName.toLowerCase() === "code";
      }),
    ).toBeDefined();
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
      if (
        url.includes("/api/chat-runs/") &&
        !url.endsWith("/elicitation") &&
        method === "POST"
      ) {
        streamCalls += 1;
        sse = controllableSse(url, init);
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
      sse!.push(resultEvent("new-chat", "Hello!"));
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

  it("acknowledges a completed marker after entering the chat", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/chat-attention")) {
        return jsonResponse({
          attentions: [
            {
              chatId: "completed-chat",
              id: "run-1:completed",
              status: "completed",
              updatedAt: "2026-07-25T01:00:00.000Z",
            },
          ],
        });
      }
      if (url.endsWith("/attention/read") && init?.method === "POST") {
        return jsonResponse({ read: true });
      }
      if (url.endsWith("/load")) {
        return jsonResponse({
          chat: daemonChat("completed-chat"),
          messages: [],
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderChat("completed-chat");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chats/completed-chat/attention/read",
        expect.objectContaining({
          body: JSON.stringify({ attentionId: "run-1:completed" }),
          method: "POST",
        }),
      );
    });
  });

  it("highlights pending input and jumps to the elicitation", async () => {
    let sse: SseHandle | undefined;
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/chat-attention")) {
          return jsonResponse({ attentions: [] });
        }
        if (url.endsWith("/load")) {
          return jsonResponse({
            chat: daemonChat("input-chat"),
            messages: [],
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
      }),
    );

    renderChat("input-chat");
    const textarea = await screen.findByLabelText("Message");
    fireEvent.change(textarea, { target: { value: "continue" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(sse).toBeDefined());
    act(() =>
      sse?.push({
        elicitation: {
          body: "Run the focused tests?",
          id: "elicitation-1",
          kind: "approval",
          phase: "open",
          title: "Permission",
        },
        type: "elicitation",
      }),
    );

    expect(
      await screen.findByText("The agent is waiting for your response."),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("renders persisted assistant text alongside tool-call cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          chat: { id: "c1", title: "Mixed turn" },
          messages: [
            { id: "u1", role: "user", content: [{ type: "text", text: "hi" }] },
            {
              id: "a1",
              role: "assistant",
              content: [
                { type: "text", text: "I'll run a command." },
                {
                  args: { command: "ls -la" },
                  type: "tool-call",
                  toolCallId: "t1",
                  toolName: "command",
                  argsText: "ls -la",
                  artifact: toolAction({
                    id: "t1",
                    phase: "completed",
                    rawInput: '{"command":"ls -la"}',
                    outputText: "done",
                  }),
                },
                { type: "text", text: " Done." },
              ],
            },
          ],
        }),
      ),
    );

    renderChat("c1");

    expect(await screen.findByText("hi")).toBeDefined();
    expect(screen.getByText("I'll run a command. Done.")).toBeDefined();
    expect(screen.getByText("command · Done")).toBeDefined();
  });

  it("streams a tool-call reply and re-enables the composer after done", async () => {
    let sse: SseHandle | undefined;
    let loadCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/load")) {
        loadCalls += 1;
        return jsonResponse({
          chat: { id: "tool-chat", title: "Tool chat" },
          messages:
            loadCalls === 1
              ? []
              : [
                  {
                    id: "u1",
                    role: "user",
                    content: [{ type: "text", text: "run it" }],
                  },
                  {
                    id: "a1",
                    role: "assistant",
                    content: [
                      { type: "text", text: "Done." },
                      {
                        args: { command: "ls" },
                        type: "tool-call",
                        toolCallId: "t1",
                        toolName: "command",
                        argsText: "ls",
                        artifact: toolAction({
                          id: "t1",
                          phase: "completed",
                          outputText: "x",
                        }),
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

    renderChat("tool-chat");
    const textarea = await screen.findByLabelText("Message");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "run it" } });
    });
    const sendButton = screen.getByLabelText("Send");
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => expect(sse).toBeDefined());
    act(() =>
      sse!.push({
        type: "tool",
        action: toolAction({
          id: "t1",
          kind: "command",
          title: "Run command",
          phase: "running",
        }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("command · Running")).toBeDefined(),
    );

    act(() =>
      sse!.push({
        type: "toolDelta",
        action: toolAction({
          id: "t1",
          kind: "command",
          title: "Run command",
          phase: "completed",
          outputText: "x",
        }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("command · Done")).toBeDefined(),
    );

    act(() => {
      sse!.push(resultEvent("tool-chat", "Done."));
      sse!.push({ type: "done" });
      sse!.close();
    });

    await waitFor(() => expect(screen.queryByLabelText("Stop")).toBeNull());
    expect(screen.getByLabelText("Send")).toBeDefined();
  });
});
