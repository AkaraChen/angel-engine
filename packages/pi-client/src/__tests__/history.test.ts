import type { PiAgentMessage } from "../types";
import { EngineEventHistoryRole } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import { historyEventsFromSessionMessages } from "../history";

describe("Pi history replay", () => {
  it("restores text, thinking, and tool results", () => {
    const events = historyEventsFromSessionMessages("conversation-1", [
      {
        content: "hello",
        role: "user",
        timestamp: 1,
      },
      {
        api: "anthropic-messages",
        content: [
          { text: "hi", type: "text" },
          { thinking: "plan", type: "thinking" },
          {
            arguments: { path: "README.md" },
            id: "tool-1",
            name: "read",
            type: "toolCall",
          },
        ],
        model: "claude",
        provider: "anthropic",
        role: "assistant",
        stopReason: "toolUse",
        timestamp: 2,
        usage: {
          cacheRead: 0,
          cacheWrite: 0,
          cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
          input: 1,
          output: 1,
          totalTokens: 2,
        },
      },
      {
        content: [{ text: "file", type: "text" }],
        isError: false,
        role: "toolResult",
        timestamp: 3,
        toolCallId: "tool-1",
        toolName: "read",
      },
    ] satisfies PiAgentMessage[]);

    expect(events).toHaveLength(5);
    expect(events[0]).toMatchObject({
      HistoryReplayChunk: {
        entry: { role: EngineEventHistoryRole.User },
      },
    });
    expect(events[1]).toMatchObject({
      HistoryReplayChunk: {
        entry: { role: EngineEventHistoryRole.Assistant },
      },
    });
    expect(events[2]).toMatchObject({
      HistoryReplayChunk: {
        entry: { role: EngineEventHistoryRole.Reasoning },
      },
    });
    expect(events[3]).toMatchObject({
      HistoryReplayChunk: {
        entry: {
          role: EngineEventHistoryRole.Tool,
          tool: {
            id: "tool-1",
            phase: "running",
          },
        },
      },
    });
    expect(events[4]).toMatchObject({
      HistoryReplayChunk: {
        entry: {
          role: EngineEventHistoryRole.Tool,
          tool: {
            id: "tool-1",
            output: [{ Text: "file" }],
            phase: "completed",
          },
        },
      },
    });
  });

  it("rejects orphaned tool results", () => {
    expect(() =>
      historyEventsFromSessionMessages("conversation-1", [
        {
          content: [{ text: "file", type: "text" }],
          isError: false,
          role: "toolResult",
          timestamp: 1,
          toolCallId: "tool-1",
          toolName: "read",
        },
      ] satisfies PiAgentMessage[]),
    ).toThrow("no matching tool call");
  });
});
