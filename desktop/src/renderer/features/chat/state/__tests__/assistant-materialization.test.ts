import type {
  ChatHistoryMessagePart,
  ChatToolAction,
  ChatToolActionOutput,
} from "@shared/chat";
import { chatToolActionToPart } from "@shared/chat";
import { describe, expect, it, vi } from "vitest";
import {
  appendToolActionDeltaPart,
  createAssistantMessage,
  materializeAssistantMessage,
} from "../chat-run-store";

vi.mock("@/features/chat/api/chat-stream", () => ({
  streamChatEvents: vi.fn(),
}));

vi.mock("@/platform/api-client", () => ({
  getApiClient: vi.fn(),
}));

type AssistantAccumulatorInput = Parameters<typeof createAssistantMessage>[1];

function accumulator(
  parts: ChatHistoryMessagePart[],
): AssistantAccumulatorInput {
  return {
    chunkCount: 3,
    parts,
    status: { type: "running" },
  };
}

function output(text: string): ChatToolActionOutput {
  return { kind: "text", text };
}

function action(overrides: Partial<ChatToolAction> = {}): ChatToolAction {
  return {
    error: undefined,
    id: "tool-1",
    inputSummary: "pwd",
    kind: "command",
    output: [],
    outputText: "",
    phase: "running",
    rawInput: '{"command":"pwd"}',
    title: "Shell",
    turnId: "turn-1",
    ...overrides,
  };
}

describe("assistant stream materialization", () => {
  it("materializes text and tool parts into assistant message content", () => {
    const parts: ChatHistoryMessagePart[] = [
      { text: "hello", type: "text" },
      chatToolActionToPart(
        action({
          output: [output("a"), output("b"), output("c")],
          outputText: "abc",
        }),
      ),
      { text: "bye", type: "text" },
    ];

    const message = createAssistantMessage(
      "assistant-1",
      accumulator(parts),
      100,
    );

    expect(message.content).toHaveLength(3);
    expect(message.content[0]).toMatchObject({
      text: "hello",
      type: "text",
    });
    expect(message.content[1]).toMatchObject({
      artifact: {
        id: "tool-1",
        output: [output("a"), output("b"), output("c")],
        outputText: "abc",
      },
      toolCallId: "tool-1",
      type: "tool-call",
    });
    expect(message.content[2]).toMatchObject({
      text: "bye",
      type: "text",
    });
  });

  it("accumulates tool output deltas in order", () => {
    const parts: ChatHistoryMessagePart[] = [
      chatToolActionToPart(
        action({
          output: [output("a")],
          outputText: "a",
        }),
      ),
    ];

    expect(
      appendToolActionDeltaPart(
        parts,
        action({ output: [output("b")], outputText: "b" }),
      ),
    ).toEqual({ index: 0, textLength: 1 });
    expect(
      appendToolActionDeltaPart(
        parts,
        action({ output: [output("c")], outputText: "c" }),
      ),
    ).toEqual({ index: 0, textLength: 1 });

    expect(parts[0]).toMatchObject({
      artifact: {
        output: [output("a"), output("b"), output("c")],
        outputText: "abc",
      },
      type: "tool-call",
    });
  });

  it("reuses materialized engine parts before the dirty index", () => {
    const parts: ChatHistoryMessagePart[] = [
      { text: "hello", type: "text" },
      chatToolActionToPart(
        action({
          output: [output("a")],
          outputText: "a",
        }),
      ),
      { text: "bye", type: "text" },
    ];
    const cache = { engineParts: [] };
    const first = materializeAssistantMessage(
      "assistant-1",
      accumulator(parts),
      100,
      cache,
      0,
    );

    parts[2] = { text: "bye!", type: "text" };
    const second = materializeAssistantMessage(
      "assistant-1",
      accumulator(parts),
      100,
      cache,
      2,
    );

    expect(second.content[0]).toBe(first.content[0]);
    expect(second.content[1]).toBe(first.content[1]);
    expect(second.content[2]).not.toBe(first.content[2]);
    expect(second.content[2]).toMatchObject({ text: "bye!" });
  });
});
