import type { Chat, ChatStreamEvent } from "@angel-engine/daemon-api/chat";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDaemonClient, readSseEvents } from "../index";

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

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function sseResponse(events: ChatStreamEvent[]): Response {
  const body = streamFrom(
    events.map(
      (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    ),
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
