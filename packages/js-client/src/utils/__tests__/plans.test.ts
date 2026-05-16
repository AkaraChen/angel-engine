import { describe, expect, it } from "vitest";
import type {
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatPlanData,
} from "../../types";
import {
  chatPlanPartName,
  cloneChatPlanData,
  isChatPlanData,
  normalizeChatPlanMessages,
  upsertChatPlanPart,
} from "../plans";

function plan(overrides: Partial<ChatPlanData> = {}): ChatPlanData {
  return {
    entries: [{ content: "Ship it", status: "pending" }],
    text: "Plan",
    ...overrides,
  };
}

describe("plan utils", () => {
  it("validates, names, and clones plan data", () => {
    const data: ChatPlanData = plan({ kind: "todo", path: "/tmp/todo.md" });
    const cloned: ChatPlanData = cloneChatPlanData(data);

    expect(isChatPlanData(data)).toBe(true);
    expect(isChatPlanData({ entries: [], text: 1 })).toBe(false);
    expect(chatPlanPartName(data)).toBe("todo");
    expect(cloned).toEqual({
      entries: [{ content: "Ship it", status: "pending" }],
      kind: "todo",
      path: "/tmp/todo.md",
      presentation: null,
      text: "Plan",
    });
  });

  it("upserts plan parts before tool calls", () => {
    const parts: ChatHistoryMessagePart[] = [
      { text: "hello", type: "text" },
      {
        args: {},
        argsText: "",
        artifact: {
          id: "tool-1",
          kind: "command",
          output: [],
          outputText: "",
          phase: "running",
          turnId: "turn-1",
        },
        toolCallId: "tool-1",
        toolName: "command",
        type: "tool-call",
      },
    ];

    upsertChatPlanPart(parts, plan());

    expect(parts[1]).toMatchObject({ name: "plan", type: "data" });
  });

  it("marks older plan messages as created or updated", () => {
    const messages: ChatHistoryMessage[] = [
      {
        content: [{ data: plan(), name: "plan", type: "data" }],
        id: "m1",
        role: "assistant",
      },
      {
        content: [{ data: plan({ text: "Next" }), name: "plan", type: "data" }],
        id: "m2",
        role: "assistant",
      },
    ];

    const normalized: ChatHistoryMessage[] =
      normalizeChatPlanMessages(messages);

    expect(normalized[0]?.content[0]).toMatchObject({
      data: { presentation: "created" },
    });
    expect(normalized[1]?.content[0]).toMatchObject({
      data: { presentation: null },
    });
  });
});
