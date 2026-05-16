import { describe, expect, it } from "vitest";
import type { ChatHistoryMessagePart } from "../../types";
import {
  appendChatTextPart,
  chatPartsText,
  cloneChatHistoryPart,
} from "../messages";

describe("message utils", () => {
  it("appends consecutive text parts without fragmenting content", () => {
    const parts: ChatHistoryMessagePart[] = [];

    appendChatTextPart(parts, "text", "hello");
    appendChatTextPart(parts, "text", " world");
    appendChatTextPart(parts, "reasoning", "think");

    expect(parts).toEqual([
      { text: "hello world", type: "text" },
      { text: "think", type: "reasoning" },
    ]);
    expect(chatPartsText(parts, "text")).toBe("hello world");
  });

  it("clones structured parts", () => {
    const part: ChatHistoryMessagePart = {
      data: {
        entries: [{ content: "One", status: "completed" }],
        text: "Done",
      },
      name: "plan",
      type: "data",
    };
    const cloned: ChatHistoryMessagePart = cloneChatHistoryPart(part);

    expect(cloned).toEqual({
      data: {
        entries: [{ content: "One", status: "completed" }],
        kind: "review",
        path: null,
        presentation: null,
        text: "Done",
      },
      name: "plan",
      type: "data",
    });
    expect(cloned).not.toBe(part);
  });
});
