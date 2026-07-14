import { afterEach, describe, expect, it } from "vitest";

import {
  clearNewChatPrompt,
  readNewChatPrompt,
  stashNewChatPrompt,
} from "./new-chat-prompt";

afterEach(() => {
  sessionStorage.clear();
});

describe("new-chat prompt handoff", () => {
  it("keeps a stashed prompt until delivery clears it", () => {
    stashNewChatPrompt("chat-1", "  fix the bug  ");
    expect(readNewChatPrompt("chat-1")).toBe("fix the bug");
    expect(readNewChatPrompt("chat-1")).toBe("fix the bug");
    clearNewChatPrompt("chat-1");
    expect(readNewChatPrompt("chat-1")).toBeUndefined();
  });

  it("does not stash an empty prompt", () => {
    stashNewChatPrompt("chat-2", "   ");
    expect(readNewChatPrompt("chat-2")).toBeUndefined();
  });

  it("keys prompts per chat", () => {
    stashNewChatPrompt("a", "prompt a");
    stashNewChatPrompt("b", "prompt b");
    expect(readNewChatPrompt("b")).toBe("prompt b");
    expect(readNewChatPrompt("a")).toBe("prompt a");
  });
});
