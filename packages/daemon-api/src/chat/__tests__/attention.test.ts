import type { ChatAttention } from "..";
import {
  isChatAttention,
  isChatAttentionListResult,
  isChatAttentionReadInput,
  isChatAttentionReadResult,
} from "..";
import { describe, expect, it } from "vitest";

const attention: ChatAttention = {
  chatId: "chat-1",
  id: "run-1:completed",
  status: "completed",
  updatedAt: "2026-07-25T01:00:00.000Z",
};

describe("chat attention boundary guards", () => {
  it("accepts canonical snapshots and read envelopes", () => {
    expect(isChatAttention(attention)).toBe(true);
    expect(
      isChatAttention({
        ...attention,
        id: "run-1:failed",
        status: "failed",
      }),
    ).toBe(true);
    expect(isChatAttentionListResult({ attentions: [attention] })).toBe(true);
    expect(isChatAttentionReadInput({ attentionId: attention.id })).toBe(true);
    expect(isChatAttentionReadResult({ read: true })).toBe(true);
  });

  it.each([
    ["an unknown status", { ...attention, status: "running" }],
    ["an empty chat id", { ...attention, chatId: "" }],
    ["an empty attention id", { ...attention, id: "" }],
    [
      "a non-canonical timestamp",
      { ...attention, updatedAt: "2026-07-25 01:00:00" },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isChatAttention(value)).toBe(false);
  });

  it("rejects duplicate attention entries for one chat", () => {
    expect(
      isChatAttentionListResult({
        attentions: [attention, { ...attention, id: "other" }],
      }),
    ).toBe(false);
  });
});
