import { afterEach, describe, expect, it } from "vitest";

import { stashNewChatPrompt, takeNewChatPrompt } from "./new-chat-prompt";

afterEach(() => {
  sessionStorage.clear();
});

describe("new-chat prompt handoff", () => {
  it("round-trips a stashed prompt once, then clears it", () => {
    stashNewChatPrompt("chat-1", "  fix the bug  ");
    expect(takeNewChatPrompt("chat-1")).toBe("fix the bug");
    expect(takeNewChatPrompt("chat-1")).toBeUndefined();
  });

  it("does not stash an empty prompt", () => {
    stashNewChatPrompt("chat-2", "   ");
    expect(takeNewChatPrompt("chat-2")).toBeUndefined();
  });

  it("keys prompts per chat", () => {
    stashNewChatPrompt("a", "prompt a");
    stashNewChatPrompt("b", "prompt b");
    expect(takeNewChatPrompt("b")).toBe("prompt b");
    expect(takeNewChatPrompt("a")).toBe("prompt a");
  });
});
