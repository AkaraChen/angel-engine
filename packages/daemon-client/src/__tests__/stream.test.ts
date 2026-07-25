import type {
  Chat,
  ChatActiveRunSnapshot,
  ChatRunObserverEvent,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDaemonClient,
  DaemonRequestError,
  readSseEvents,
} from "../index";

const chat: Chat = {
  archived: false,
  createdAt: "2026-07-13T00:00:00.000Z",
  cwd: "/tmp",
  id: "chat-1",
  pinned: false,
  projectId: null,
  remoteThreadId: null,
  runtime: "codex",
  title: "Test",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

const activeRun: ChatActiveRunSnapshot = {
  assistantMessage: {
    content: [{ text: "Hel", type: "text" }],
    createdAt: "2026-07-24T00:00:00.000Z",
    id: "run-1:assistant",
    role: "assistant",
  },
  chatId: "chat-1",
  lastEventSequence: 1,
  pendingElicitation: null,
  runId: "run-1",
  startedAt: "2026-07-24T00:00:00.000Z",
  status: "running",
  updatedAt: "2026-07-24T00:00:01.000Z",
  userMessage: {
    content: [{ text: "Hi", type: "text" }],
    createdAt: "2026-07-24T00:00:00.000Z",
    id: "run-1:user",
    role: "user",
  },
};

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function sseResponse(events: readonly unknown[]): Response {
  const body = streamFrom(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`),
  );
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readSseEvents", () => {
  it("parses one event per blank-line-delimited block across chunk boundaries", async () => {
    const stream = streamFrom([
      'event: delta\ndata: {"a":1}\n\nev',
      'ent: delta\ndata: {"b',
      '":2}\n\n',
    ]);
    expect(await collect(readSseEvents(stream))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("joins multiple data lines and ignores comments and trailing data", async () => {
    const stream = streamFrom([
      ': keep-alive comment\ndata: {"a":\ndata: 1}\n\ndata: {"b":2}',
    ]);
    expect(await collect(readSseEvents(stream))).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe("streamChat", () => {
  it("streams parsed SSE events and posts to /api/chat-streams with the stream id", async () => {
    const events: ChatStreamEvent[] = [
      { type: "delta", part: "text", text: "Hel" },
      { type: "delta", part: "text", text: "lo" },
      {
        type: "result",
        result: {
          chat,
          chatId: chat.id,
          content: [{ text: "Hello", type: "text" }],
          text: "Hello",
        },
      },
      { type: "done" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(events));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: "secret" });
    const received = await collect(
      client.chatStreams.send({ chatId: "chat-1", text: "hi" }, "stream-9"),
    );

    expect(received).toEqual(events);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat-streams?streamId=stream-9");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer secret",
    );
    expect(init.body).toBe(JSON.stringify({ chatId: "chat-1", text: "hi" }));
  });

  it("throws on a non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(
      collect(client.chatStreams.send({ chatId: "c", text: "hi" }, "s")),
    ).rejects.toThrow(/POST \/api\/chat-streams/);
  });

  it.each([
    ["unknown event type", { type: "futureEvent" }],
    ["missing required field", { part: "text", type: "delta" }],
  ])("fails fast on %s", async (_label, event) => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([event]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    const rejection = collect(
      client.chatStreams.send({ chatId: "c", text: "hi" }, "s"),
    );

    await expect(rejection).rejects.toBeInstanceOf(DaemonRequestError);
    await expect(rejection).rejects.toMatchObject({
      name: "DaemonRequestError",
      status: 200,
    });
    await expect(rejection).rejects.toThrow(/invalid chat stream event/);
  });
});

describe("chatRuns", () => {
  it("starts with a validated snapshot and contiguous observer events", async () => {
    const messages: ChatRunObserverEvent[] = [
      { snapshot: activeRun, type: "snapshot" },
      {
        event: { part: "text", text: "lo", type: "delta" },
        sequence: 2,
        type: "event",
      },
      { event: { type: "done" }, sequence: 3, type: "event" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(messages));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: "secret" });
    await expect(
      collect(client.chatRuns.start({ chatId: "chat-1", text: "Hi" }, "run-1")),
    ).resolves.toEqual(messages);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat-runs/run-1");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ chatId: "chat-1", text: "Hi" }));
  });

  it.each([
    [
      "an event before the snapshot",
      [
        {
          event: { part: "text", text: "x", type: "delta" },
          sequence: 1,
          type: "event",
        },
      ],
    ],
    [
      "a sequence gap",
      [
        { snapshot: activeRun, type: "snapshot" },
        {
          event: { part: "text", text: "x", type: "delta" },
          sequence: 3,
          type: "event",
        },
      ],
    ],
    ["an empty stream", []],
  ])("rejects %s", async (_label, messages) => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(messages));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(collect(client.chatRuns.observe("run-1"))).rejects.toThrow(
      /invalid chat run response/,
    );
  });

  it("validates active-run lookup responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ run: activeRun }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(client.chatRuns.getActive("chat-1")).resolves.toEqual({
      run: activeRun,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chats/chat-1/active-run");
  });

  it("rejects a malformed active-run lookup before product state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ run: { ...activeRun, runId: "" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(client.chatRuns.getActive("chat-1")).rejects.toThrow(
      /invalid chat run response/,
    );
  });

  it("stops and resolves a run through run-owned routes", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await client.chatRuns.stop("run-1");
    await client.chatRuns.resolveElicitation("run-1", {
      elicitationId: "elic-1",
      response: { type: "allow" },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat-runs/run-1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/chat-runs/run-1/elicitation",
    );
  });
});

describe("chat metadata + history", () => {
  it("loads a chat transcript via POST /api/chats/:id/load", async () => {
    const result = { chat: { id: "c1", title: "Fix bug" }, messages: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(result));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    expect(await client.chats.load("c1")).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chats/c1/load");
    expect(init.method).toBe("POST");
  });

  it("fetches a chat via GET /api/chats/:id", async () => {
    const chat = { id: "c1", title: "Fix bug" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(chat));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    expect(await client.chats.get("c1")).toEqual(chat);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chats/c1");
  });

  it("aborts a stream via DELETE /api/chat-streams/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.chatStreams.abort("stream-9");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat-streams/stream-9");
    expect(init.method).toBe("DELETE");
  });

  it("resolves an elicitation via POST /api/chat-streams/:id/elicitation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ resolved: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.chatStreams.resolveElicitation("stream-9", {
      elicitationId: "elic-1",
      response: { type: "allow" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat-streams/stream-9/elicitation");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ elicitationId: "elic-1", response: { type: "allow" } }),
    );
  });
});
