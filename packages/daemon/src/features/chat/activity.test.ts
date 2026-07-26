import type { ChatStreamEvent } from "@angel-engine/daemon-api/chat";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatActivityStore } from "./activity";

const openInput = {
  elicitation: {
    id: "elicitation-1",
    kind: "approval",
    phase: "open",
  },
  type: "elicitation",
} as const satisfies ChatStreamEvent;

const result = {
  result: {
    chat: {
      archived: false,
      createdAt: "2026-07-25T00:00:00.000Z",
      cwd: null,
      id: "chat-1",
      pinned: false,
      projectId: null,
      remoteThreadId: null,
      runtime: "codex",
      title: "Test",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    chatId: "chat-1",
    content: [],
    text: "done",
  },
  type: "result",
} as const satisfies ChatStreamEvent;

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatActivityStore", () => {
  it("keeps input ahead of success and requires the exact terminal marker", () => {
    const store = new ChatActivityStore({
      now: () => "2026-07-25T01:00:00.000Z",
    });
    store.start("chat-1", "run-1");

    expect(store.apply("chat-1", "run-1", openInput)).toBe(true);
    expect(store.apply("chat-1", "run-1", result)).toBe(false);
    expect(store.list().items).toEqual([
      {
        attentionId: "run-1:input:elicitation-1",
        chatId: "chat-1",
        reason: "approval",
        runId: "run-1",
        status: "waiting_for_you",
        updatedAt: "2026-07-25T01:00:00.000Z",
      },
    ]);

    expect(store.resolveInput("chat-1", "run-1", "stale-elicitation")).toBe(
      false,
    );
    expect(store.resolveInput("chat-1", "run-1", "elicitation-1")).toBe(true);
    expect(store.list().items[0]?.status).toBe("done");
    expect(store.apply("chat-1", "run-1", result)).toBe(false);
    expect(store.acknowledge("chat-1", "stale-marker")).toBe(false);
    expect(store.acknowledge("chat-1", "run-1:done")).toBe(true);
    expect(store.list()).toEqual({ items: [] });
  });

  it("distinguishes runtime failure from explicit cancellation", () => {
    const store = new ChatActivityStore();
    store.start("chat-1", "run-1");

    expect(
      store.apply("chat-1", "run-1", {
        message: "Provider failed\nprivate detail",
        type: "error",
      }),
    ).toBe(true);
    expect(store.list().items[0]).toMatchObject({
      attentionId: "run-1:failed",
      failure: { message: "Provider failed" },
      reason: "runtime_error",
      status: "failed",
    });

    store.start("chat-1", "run-2");
    expect(store.cancel("chat-1", "run-2")).toBe(true);
    expect(
      store.apply("chat-1", "run-2", {
        message: "Abort surfaced as an error",
        type: "error",
      }),
    ).toBe(false);
    expect(store.list()).toEqual({ items: [] });
  });

  it("ignores late events and stale acknowledgements from older runs", () => {
    const store = new ChatActivityStore();
    store.start("chat-1", "run-1");
    store.apply("chat-1", "run-1", result);
    store.start("chat-1", "run-2");
    store.apply("chat-1", "run-2", openInput);

    expect(store.apply("chat-1", "run-1", result)).toBe(false);
    expect(store.acknowledge("chat-1", "run-1:done")).toBe(false);
    expect(store.list().items[0]).toMatchObject({
      attentionId: "run-2:input:elicitation-1",
      runId: "run-2",
      status: "waiting_for_you",
    });
  });

  it("derives legacy attention from the same projection", () => {
    const store = new ChatActivityStore();
    store.start("chat-1", "run-1");
    store.apply("chat-1", "run-1", openInput);

    expect(store.attentionList()).toMatchObject({
      attentions: [
        {
          chatId: "chat-1",
          id: "run-1:input:elicitation-1",
          status: "needsInput",
        },
      ],
    });

    store.apply("chat-1", "run-1", {
      message: "failed",
      type: "error",
    });
    expect(store.list().items[0]?.status).toBe("failed");
    expect(store.attentionList()).toEqual({ attentions: [] });
  });

  it("projects tool decisions and multiple chats without message payloads", () => {
    const store = new ChatActivityStore();
    store.start("chat-1", "run-1");
    store.start("chat-2", "run-2");
    store.apply("chat-1", "run-1", {
      action: {
        elicitationId: "permission-1",
        id: "action-1",
        kind: "command",
        output: [],
        outputText: "",
        phase: "awaitingDecision",
        rawInput: '{"command":"nr test"}',
        title: "Run tests",
        turnId: "turn-1",
      },
      type: "tool",
    });
    store.apply("chat-2", "run-2", result);

    expect(store.list().items).toMatchObject([
      {
        attentionId: "run-1:input:permission-1",
        chatId: "chat-1",
        reason: "approval",
        status: "waiting_for_you",
      },
      { chatId: "chat-2", runId: "run-2", status: "done" },
    ]);
  });

  it("marks only a PID-backed active run stuck after the grace period", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const store = new ChatActivityStore({ onChange, stuckGraceMs: 100 });
    store.start("chat-1", "run-1");
    onChange.mockClear();

    vi.advanceTimersByTime(10_000);
    expect(store.list().items[0]?.status).toBe("running");

    store.replaceProcessEntries([
      { id: "chat-1", label: "Test", rootPid: 123 },
    ]);
    store.replaceProcessEntries([]);
    vi.advanceTimersByTime(99);
    expect(store.list().items[0]?.status).toBe("running");
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(store.list().items[0]).toMatchObject({
      reason: "process_exited",
      status: "stuck",
    });
    expect(onChange).toHaveBeenCalledWith("chat-1");

    onChange.mockClear();
    store.replaceProcessEntries([
      { id: "chat-1", label: "Test", rootPid: 456 },
    ]);
    expect(store.list().items[0]?.status).toBe("running");
    expect(onChange).toHaveBeenCalledWith("chat-1");
  });

  it("does not hide pending input when PID loss matures", () => {
    vi.useFakeTimers();
    const store = new ChatActivityStore({ stuckGraceMs: 100 });
    store.start("chat-1", "run-1");
    store.replaceProcessEntries([
      { id: "chat-1", label: "Test", rootPid: 123 },
    ]);
    store.apply("chat-1", "run-1", openInput);
    store.replaceProcessEntries([]);

    vi.advanceTimersByTime(100);
    expect(store.list().items[0]?.status).toBe("waiting_for_you");
    store.resolveInput("chat-1", "run-1", "elicitation-1");
    expect(store.list().items[0]?.status).toBe("stuck");
  });
});
