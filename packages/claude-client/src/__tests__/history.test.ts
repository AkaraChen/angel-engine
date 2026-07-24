import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  EngineEventContentKind,
  EngineEventHistoryRole,
} from "@angel-engine/client-napi";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { historyEventsFromSessionMessages } from "../history";

function sessionMessage(
  type: SessionMessage["type"],
  content: unknown,
): SessionMessage {
  return {
    message: { content },
    parent_tool_use_id: null,
    session_id: "session-1",
    type,
    uuid: "message-1",
  };
}

describe("Claude history replay", () => {
  it("skips unknown assistant and user block types", () => {
    const events = historyEventsFromSessionMessages("conversation-1", [
      sessionMessage("assistant", [
        { type: "server_tool_use", id: "tool-1" },
        { text: "hello", type: "text" },
      ]),
      sessionMessage("user", [
        { type: "unknown_user_block", value: true },
        { text: "thanks", type: "text" },
      ]),
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      HistoryReplayChunk: {
        entry: { role: EngineEventHistoryRole.Assistant },
      },
    });
    expect(events[1]).toMatchObject({
      HistoryReplayChunk: {
        entry: { role: EngineEventHistoryRole.User },
      },
    });
  });

  it("still rejects malformed known block types", () => {
    expect(() =>
      historyEventsFromSessionMessages("conversation-1", [
        sessionMessage("assistant", [{ type: "text", text: 1 }]),
      ]),
    ).toThrow("Claude assistant text history block is malformed.");
  });

  it("restores tool calls with engine tool actions", () => {
    const events = historyEventsFromSessionMessages("conversation-1", [
      sessionMessage("assistant", [
        {
          id: "tool-1",
          input: { file_path: "example.txt" },
          name: "Read",
          type: "tool_use",
        },
      ]),
      sessionMessage("user", [
        {
          content: "ok",
          tool_use_id: "tool-1",
          type: "tool_result",
        },
      ]),
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      HistoryReplayChunk: {
        entry: {
          role: EngineEventHistoryRole.Tool,
          tool: {
            id: "tool-1",
            phase: "running",
            title: "Read example.txt",
          },
        },
      },
    });
    expect(events[1]).toMatchObject({
      HistoryReplayChunk: {
        entry: {
          role: EngineEventHistoryRole.Tool,
          tool: {
            id: "tool-1",
            output: [{ Text: "ok" }],
            phase: "completed",
          },
        },
      },
    });
  });

  it("restores user text and resource attachments as one replay message", () => {
    const events = historyEventsFromSessionMessages("conversation-1", [
      sessionMessage("user", [
        { text: "这个讲了什么", type: "text" },
        {
          text: "Resource: attachment:///PRD_%E6%99%BA%E8%83%BD%E4%BD%93.md\n\n# 智能体广场\n\n内容",
          type: "text",
        },
      ]),
    ]);

    expect(events).toEqual([
      {
        HistoryReplayChunk: {
          conversation_id: "conversation-1",
          entry: {
            content: {
              Parts: [
                { Text: "这个讲了什么" },
                {
                  File: {
                    data: "# 智能体广场\n\n内容",
                    mime_type: "text/markdown",
                    name: "PRD_智能体.md",
                  },
                },
              ],
            },
            role: EngineEventHistoryRole.User,
          },
        },
      },
    ]);
  });

  it("restores user text and attached text resource cards as one replay message", () => {
    const events = historyEventsFromSessionMessages("conversation-1", [
      sessionMessage("user", [
        { text: "这个讲了什么", type: "text" },
        {
          text: "Attached text resource: attachment:///PRD_%E6%99%BA%E8%83%BD%E4%BD%93.md\nMIME type: text/markdown\n\n# 智能体广场\n\n内容",
          type: "text",
        },
      ]),
    ]);

    expect(events).toEqual([
      {
        HistoryReplayChunk: {
          conversation_id: "conversation-1",
          entry: {
            content: {
              Parts: [
                { Text: "这个讲了什么" },
                {
                  File: {
                    data: "# 智能体广场\n\n内容",
                    mime_type: "text/markdown",
                    name: "PRD_智能体.md",
                  },
                },
              ],
            },
            role: EngineEventHistoryRole.User,
          },
        },
      },
    ]);
  });

  it("dedupes Write→ExitPlanMode within a turn but allows the same plan on the next user turn", () => {
    const planBody = "# Plan\n\n- Step one\n";
    const planFilePath = path.join(homedir(), ".claude", "plans", "note.md");
    const writeTool = (id: string) => ({
      id,
      input: { content: planBody, file_path: planFilePath },
      name: "Write",
      type: "tool_use" as const,
    });
    const exitTool = (id: string) => ({
      id,
      input: { plan: planBody, planFilePath },
      name: "ExitPlanMode",
      type: "tool_use" as const,
    });

    const events = historyEventsFromSessionMessages("conversation-1", [
      sessionMessage("user", "make a plan"),
      sessionMessage("assistant", [writeTool("w1"), exitTool("e1")]),
      sessionMessage("user", "make the same plan again"),
      sessionMessage("assistant", [writeTool("w2"), exitTool("e2")]),
    ]);

    const structuredPlans = events.flatMap((event) => {
      const chunk = (
        event as {
          HistoryReplayChunk?: { entry?: { content?: Record<string, string> } };
        }
      ).HistoryReplayChunk;
      const structured =
        chunk?.entry?.content?.[EngineEventContentKind.Structured];
      if (typeof structured !== "string") return [];
      try {
        const parsed = JSON.parse(structured) as {
          type?: string;
          text?: string;
        };
        return parsed.type === "plan" ? [parsed] : [];
      } catch {
        return [];
      }
    });

    expect(structuredPlans).toHaveLength(2);
    expect(structuredPlans.every((plan) => plan.text === planBody)).toBe(true);
  });
});
