import type { ChatPlanData } from "@shared/chat";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform/api-client", () => ({
  getApiClient: () => ({}),
}));
vi.mock("@/features/chat/api/chat-stream", () => ({
  async *streamChatEvents() {},
}));

const { normalizeEnginePlanMessages } = await import("../chat-run-store");
type EngineMessage = Parameters<typeof normalizeEnginePlanMessages>[0][number];

function planData(text: string, kind?: ChatPlanData["kind"]): ChatPlanData {
  return {
    entries: [{ content: text, status: "pending" }],
    text,
    ...(kind === undefined ? {} : { kind }),
  };
}

function assistantMessage(
  id: string,
  content: EngineMessage["content"],
): EngineMessage {
  return {
    content,
    createdAt: new Date(),
    id,
    metadata: {
      custom: {},
      steps: [],
      unstable_annotations: [],
      unstable_data: [],
      unstable_state: null,
    },
    role: "assistant",
    status: { reason: "stop", type: "complete" },
  } as unknown as EngineMessage;
}

describe("normalizeEnginePlanMessages", () => {
  it("returns the input array unchanged when there are no plan parts", () => {
    const messages: EngineMessage[] = [
      assistantMessage("m1", [{ text: "hello", type: "text" }]),
    ];

    const result = normalizeEnginePlanMessages(messages);

    expect(result).toBe(messages);
  });

  it("marks a lone plan part as null (it is both first and latest)", () => {
    const messages: EngineMessage[] = [
      assistantMessage("m1", [
        { data: planData("Plan A"), name: "plan", type: "data" },
      ]),
    ];

    const result = normalizeEnginePlanMessages(messages);

    expect(result[0]?.content[0]).toMatchObject({
      data: { presentation: null },
    });
  });

  it("indexes two same-kind parts across messages: first created, last null, middle updated", () => {
    const messages: EngineMessage[] = [
      assistantMessage("m1", [
        { data: planData("Plan A"), name: "plan", type: "data" },
      ]),
      assistantMessage("m2", [
        { data: planData("Plan B"), name: "plan", type: "data" },
      ]),
      assistantMessage("m3", [
        { data: planData("Plan C"), name: "plan", type: "data" },
      ]),
    ];

    const result = normalizeEnginePlanMessages(messages);

    expect(result[0]?.content[0]).toMatchObject({
      data: { presentation: "created" },
    });
    expect(result[1]?.content[0]).toMatchObject({
      data: { presentation: "updated" },
    });
    expect(result[2]?.content[0]).toMatchObject({
      data: { presentation: null },
    });
  });

  it("indexes plan and todo kinds independently", () => {
    const messages: EngineMessage[] = [
      assistantMessage("m1", [
        { data: planData("Plan A"), name: "plan", type: "data" },
        { data: planData("Todo A", "todo"), name: "todo", type: "data" },
      ]),
      assistantMessage("m2", [
        { data: planData("Plan B"), name: "plan", type: "data" },
        { data: planData("Todo B", "todo"), name: "todo", type: "data" },
      ]),
    ];

    const result = normalizeEnginePlanMessages(messages);

    expect(result[0]?.content[0]).toMatchObject({
      data: { presentation: "created" },
    });
    expect(result[0]?.content[1]).toMatchObject({
      data: { presentation: "created" },
    });
    expect(result[1]?.content[0]).toMatchObject({
      data: { presentation: null },
    });
    expect(result[1]?.content[1]).toMatchObject({
      data: { presentation: null },
    });
  });

  it("passes non-plan content through unchanged", () => {
    const messages: EngineMessage[] = [
      assistantMessage("m1", [
        { text: "hello", type: "text" },
        { data: planData("Plan A"), name: "plan", type: "data" },
      ]),
    ];

    const result = normalizeEnginePlanMessages(messages);

    expect(result[0]?.content[0]).toEqual({ text: "hello", type: "text" });
  });
});
