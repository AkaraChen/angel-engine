import type {
  ChatActiveRunSnapshot,
  ChatRunObserverEvent,
} from "@angel-engine/daemon-api/chat";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDaemonClient, readSseEvents } from "../index";

const runSnapshot: ChatActiveRunSnapshot = {
  assistantMessage: {
    content: [],
    createdAt: "2026-07-25T00:00:00.000Z",
    id: "run-1:assistant",
    role: "assistant",
  },
  chatId: "chat-1",
  lastEventSequence: 0,
  pendingElicitation: null,
  runId: "run-1",
  startedAt: "2026-07-25T00:00:00.000Z",
  status: "running",
  updatedAt: "2026-07-25T00:00:00.000Z",
  userMessage: {
    content: [{ text: "hi", type: "text" }],
    createdAt: "2026-07-25T00:00:00.000Z",
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

describe("chatRuns", () => {
  const events: ChatRunObserverEvent[] = [
    { snapshot: runSnapshot, type: "snapshot" },
    {
      event: { part: "text", text: "Hello", type: "delta" },
      sequence: 1,
      type: "event",
    },
    { event: { type: "done" }, sequence: 2, type: "event" },
  ];

  it("starts and observes snapshot-first contiguous run streams", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse(events))
      .mockResolvedValueOnce(sseResponse(events));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    expect(
      await collect(
        client.chatRuns.start("run-1", { chatId: "chat-1", text: "hi" }),
      ),
    ).toEqual(events);
    expect(await collect(client.chatRuns.observe("run-1"))).toEqual(events);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat-runs/run-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/chat-runs/run-1/events");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
  });

  it("validates active-run lookup responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot }))
      .mockResolvedValueOnce(jsonResponse({ run: { status: "future" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(client.chatRuns.active("chat-1")).resolves.toEqual({
      run: runSnapshot,
    });
    await expect(client.chatRuns.active("chat-1")).rejects.toThrow(
      /invalid active chat run/,
    );
  });

  it("discovers and clears an ambiguous run by chat id", async () => {
    const ambiguous = {
      run: {
        chatId: "chat-1",
        createdAt: "2026-08-10T00:00:00.000Z",
        runId: "run-ambiguous",
        status: "dispatching",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(ambiguous))
      .mockResolvedValueOnce(jsonResponse({ cleared: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(client.chats.ambiguousRun("chat-1")).resolves.toEqual(
      ambiguous,
    );
    await expect(client.chats.clearAmbiguousRun("chat-1")).resolves.toEqual({
      cleared: true,
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chats/chat-1/ambiguous-run");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
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
      /snapshot/,
    ],
    [
      "a sequence gap",
      [
        { snapshot: runSnapshot, type: "snapshot" },
        {
          event: { part: "text", text: "x", type: "delta" },
          sequence: 2,
          type: "event",
        },
      ],
      /non-contiguous/,
    ],
    [
      "a malformed nested event",
      [
        { snapshot: runSnapshot, type: "snapshot" },
        {
          event: { part: "analysis", text: "x", type: "delta" },
          sequence: 1,
          type: "event",
        },
      ],
      /invalid chat run event/,
    ],
  ])("fails fast on %s", async (_label, messages, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(messages));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(collect(client.chatRuns.observe("run-1"))).rejects.toThrow(
      expected,
    );
  });

  it("stops and resolves input through the run routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ resolved: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createDaemonClient({ baseUrl: "", token: null });

    await client.chatRuns.stop("run-1");
    await client.chatRuns.resolveElicitation("run-1", {
      elicitationId: "elic-1",
      response: { type: "allow" },
    });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat-runs/run-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/chat-runs/run-1/elicitation");
  });
});

describe("projects.clone", () => {
  it("streams progress through the terminal clone event", async () => {
    const events = [
      {
        detail: null,
        percent: 0,
        stage: "cloning",
        targetPath: "/tmp/repo",
        type: "progress",
      },
      {
        project: { id: "project-1", path: "/tmp/repo" },
        reusedExistingCheckout: false,
        type: "completed",
      },
    ] as const;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(events)));
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(
      collect(client.projects.clone({ url: "owner/repo" })),
    ).resolves.toEqual(events);
  });

  it("rejects a clone stream that closes before a terminal event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            detail: null,
            percent: 10,
            stage: "cloning",
            targetPath: "/tmp/repo",
            type: "progress",
          },
        ]),
      ),
    );
    const client = createDaemonClient({ baseUrl: "", token: null });

    await expect(
      collect(client.projects.clone({ url: "owner/repo" })),
    ).rejects.toThrow(/without a terminal event/);
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
});
