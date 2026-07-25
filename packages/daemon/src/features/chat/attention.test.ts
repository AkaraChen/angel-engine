import { describe, expect, it } from "vitest";

import { ChatAttentionStore } from "./attention";

const openInput = {
  elicitation: {
    id: "elicitation-1",
    kind: "approval",
    phase: "open",
  },
  type: "elicitation",
} as const;

describe("ChatAttentionStore", () => {
  it("keeps daemon-owned attention until the exact state clears", () => {
    const store = new ChatAttentionStore(() => "2026-07-25T01:00:00.000Z");

    expect(store.apply("chat-1", "run-1", openInput)).toBe(true);
    expect(store.apply("chat-1", "run-1", openInput)).toBe(false);
    expect(store.list()).toEqual({
      attentions: [
        {
          chatId: "chat-1",
          id: "run-1:input:elicitation-1",
          status: "needsInput",
          updatedAt: "2026-07-25T01:00:00.000Z",
        },
      ],
    });

    expect(store.resolveInput("chat-1", "run-1", "stale-elicitation")).toBe(
      false,
    );
    expect(store.resolveInput("chat-1", "run-1", "elicitation-1")).toBe(true);
    expect(
      store.apply("chat-1", "run-1", {
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
      }),
    ).toBe(true);
    expect(store.acknowledge("chat-1", "stale-attention")).toBe(false);
    expect(store.acknowledge("chat-1", "run-1:completed")).toBe(true);
    expect(store.list()).toEqual({ attentions: [] });
  });

  it("does not downgrade pending input to completed", () => {
    const store = new ChatAttentionStore();
    store.apply("chat-1", "run-1", openInput);

    expect(
      store.apply("chat-1", "run-1", {
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
      }),
    ).toBe(false);
    expect(store.acknowledge("chat-1", "run-1:input:elicitation-1")).toBe(
      false,
    );
    expect(store.list().attentions[0]?.status).toBe("needsInput");
  });

  it("clears only the failed run's pending input", () => {
    const store = new ChatAttentionStore();
    store.apply("chat-1", "run-1", openInput);

    expect(
      store.apply("chat-1", "other-run", {
        message: "failed",
        type: "error",
      }),
    ).toBe(false);
    expect(
      store.apply("chat-1", "run-1", {
        message: "failed",
        type: "error",
      }),
    ).toBe(true);
    expect(store.list()).toEqual({ attentions: [] });
  });
});
