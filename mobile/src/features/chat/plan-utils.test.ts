import { describe, expect, it } from "vitest";

import type { ConversationMessage } from "@/platform/chat-types";

import {
  isChatPlanData,
  normalizeChatPlanMessages,
  normalizeConversationPlans,
  upsertPlan,
} from "./plan-utils";

const plan = (text: string, kind: "review" | "todo" = "review") => ({
  text,
  entries: [] as { content: string; status: "pending" }[],
  kind,
});

function conversationRow(
  id: string,
  plans: ConversationMessage["plans"],
): ConversationMessage {
  return {
    id,
    role: "assistant",
    text: "",
    reasoning: "",
    status: "complete",
    toolCalls: [],
    plans,
  };
}

describe("isChatPlanData", () => {
  it("accepts valid plan snapshots", () => {
    expect(
      isChatPlanData({
        text: "Do the thing",
        entries: [{ content: "step", status: "pending" }],
        kind: "review",
      }),
    ).toBe(true);
  });

  it("rejects missing text or bad entries", () => {
    expect(isChatPlanData({ entries: [] })).toBe(false);
    expect(
      isChatPlanData({
        text: "x",
        entries: [{ content: "a", status: "nope" }],
      }),
    ).toBe(false);
  });
});

describe("normalizeChatPlanMessages", () => {
  it("marks older plans of the same kind as created/updated", () => {
    const messages = normalizeChatPlanMessages([
      {
        id: "a1",
        role: "assistant",
        content: [{ type: "data", name: "plan", data: plan("first") }],
      },
      {
        id: "a2",
        role: "assistant",
        content: [{ type: "data", name: "plan", data: plan("second") }],
      },
    ]);
    const first = messages[0].content[0];
    const second = messages[1].content[0];
    expect(first).toMatchObject({
      data: { presentation: "created", text: "first" },
    });
    expect(second).toMatchObject({
      data: { presentation: null, text: "second" },
    });
  });
});

describe("upsertPlan", () => {
  it("replaces plans of the same kind and appends new kinds", () => {
    const once = upsertPlan([], plan("v1", "review"));
    const twice = upsertPlan(once, plan("v2", "review"));
    const withTodo = upsertPlan(twice, plan("t1", "todo"));
    expect(twice).toHaveLength(1);
    expect(twice[0].text).toBe("v2");
    expect(withTodo.map((p) => p.kind)).toEqual(["review", "todo"]);
  });
});

describe("normalizeConversationPlans", () => {
  it("collapses a persisted full plan when a later live plan supersedes it", () => {
    const messages = normalizeConversationPlans([
      conversationRow("persisted", [plan("old plan")]),
      conversationRow("live", [plan("new plan")]),
    ]);
    expect(messages[0].plans[0].presentation).toBe("created");
    expect(messages[0].plans[0].text).toBe("old plan");
    expect(messages[1].plans[0].presentation).toBeNull();
    expect(messages[1].plans[0].text).toBe("new plan");
  });
});
