import { describe, expect, it } from "vitest";

import { ChatAttentionStore } from "./attention";

describe("ChatAttentionStore", () => {
  it("keeps the latest daemon-owned attention until its exact state clears", () => {
    const store = new ChatAttentionStore(() => "2026-07-25T01:00:00.000Z");

    expect(store.needsInput("chat-1", "run-1", "elicitation-1")).toBe(true);
    expect(store.needsInput("chat-1", "run-1", "elicitation-1")).toBe(false);
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

    expect(store.completed("chat-1", "run-1")).toBe(true);
    expect(store.resolveInput("chat-1", "run-1", "elicitation-1")).toBe(false);
    expect(store.acknowledge("chat-1", "stale-attention")).toBe(false);
    expect(store.acknowledge("chat-1", "run-1:completed")).toBe(true);
    expect(store.list()).toEqual({ attentions: [] });
  });

  it("does not let a read acknowledgement clear pending input", () => {
    const store = new ChatAttentionStore();
    store.needsInput("chat-1", "run-1", "elicitation-1");

    expect(store.acknowledge("chat-1", "run-1:input:elicitation-1")).toBe(
      false,
    );
    expect(store.list().attentions).toHaveLength(1);
  });
});
