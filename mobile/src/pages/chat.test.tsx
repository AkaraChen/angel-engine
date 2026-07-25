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
  ChatActiveRunSnapshot,
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

function controllableRunSse(
  url: string,
  init: RequestInit | undefined,
): SseHandle {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let sequence = 0;
  const body = init?.body;
  const input = JSON.parse(typeof body === "string" ? body : "{}") as {
    chatId?: string;
    text?: string;
  };
  const runId = /\/api\/chat-runs\/([^/]+)$/.exec(url)?.[1] ?? "test-run";
  const timestamp = "2026-07-24T00:00:00.000Z";
  const snapshot: ChatActiveRunSnapshot = {
    assistantMessage: {
      content: [],
      createdAt: timestamp,
      id: `${runId}:assistant`,
      role: "assistant",
    },
    chatId: input.chatId ?? "test-chat",
    lastEventSequence: 0,
    pendingElicitation: null,
    runId,
    startedAt: timestamp,
    status: "running",
    updatedAt: timestamp,
    userMessage: {
      content: [{ text: input.text ?? "", type: "text" }],
      createdAt: timestamp,
      id: `${runId}:user`,
      role: "user",
    },
  };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  init?.signal?.addEventListener("abort", () => {
    try {
      controller.error(new DOMException("aborted", "AbortError"));
    } catch {
      // already closed
    }
  });
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({ snapshot, type: "snapshot" })}\n\n`,
    ),
  );
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    push: (event) => {
      sequence += 1;
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            event,
            sequence,
            type: "event",
          })}\n\n`,
        ),
      );
    },
    close: () => controller.close(),
  };
}

function isRunStartRequest(url: string, init?: RequestInit): boolean {
  return (
    url.includes("/api/chat-runs/") &&
    (init?.method ?? "GET") === "POST" &&
    !url.endsWith("/elicitation")
  );
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
      vi.fn(async (url: string) =>
        jsonResponse(
          url.endsWith("/active-run")
            ? { run: null }
            : {
                chat: { id: "c1", title: "Greeting" },
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
              },
        ),
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
      vi.fn(async (url: string) =>
        jsonResponse(
          url.endsWith("/active-run")
            ? { run: null }
            : {
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
              },
        ),
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
      if (url.endsWith("/active-run")) return jsonResponse({ run: null });
      if (isRunStartRequest(url, init)) {
        streamCalls += 1;
        sse = controllableRunSse(url, init);
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

  it("renders persisted assistant text alongside tool-call cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        jsonResponse(
          url.endsWith("/active-run")
            ? { run: null }
            : {
                chat: { id: "c1", title: "Mixed turn" },
                messages: [
                  {
                    id: "u1",
                    role: "user",
                    content: [{ type: "text", text: "hi" }],
                  },
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
              },
        ),
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
      if (url.endsWith("/active-run")) return jsonResponse({ run: null });
      if (isRunStartRequest(url, init)) {
        sse = controllableRunSse(url, init);
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
