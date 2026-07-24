import type {
  Chat,
  ChatElicitation,
  ChatPlanData,
  ChatRuntimeConfig,
  ChatStreamEvent,
  ChatToolAction,
} from "..";
import { isChatStreamEvent } from "..";
import { describe, expect, it } from "vitest";

const chat: Chat = {
  archived: false,
  createdAt: "2026-07-24T00:00:00.000Z",
  cwd: "/tmp/project",
  id: "chat-1",
  pinned: false,
  projectId: null,
  remoteThreadId: null,
  runtime: "codex",
  title: "Typed boundary",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

const plan: ChatPlanData = {
  entries: [{ content: "Validate SSE", status: "in_progress" }],
  kind: "review",
  text: "Keep the boundary typed.",
};

const elicitation: ChatElicitation = {
  body: "Run the focused tests?",
  id: "elicitation-1",
  kind: "approval",
  phase: "pending",
  title: "Permission",
};

const action: ChatToolAction = {
  id: "action-1",
  inputSummary: "nr test",
  kind: "command",
  output: [{ kind: "text", text: "ok" }],
  outputText: "ok",
  phase: "completed",
  rawInput: '{"command":"nr test"}',
  title: "Run tests",
  turnId: "turn-1",
};

const config: ChatRuntimeConfig = {
  modes: [],
  models: [],
  permissionModes: [],
  reasoningEfforts: [],
};

const validEvents: ChatStreamEvent[] = [
  { chat, type: "chat" },
  { part: "reasoning", text: "thinking", turnId: "turn-1", type: "delta" },
  { plan, turnId: "turn-1", type: "plan" },
  { elicitation, type: "elicitation" },
  { action, type: "tool" },
  { action, type: "toolDelta" },
  {
    result: {
      chat,
      chatId: chat.id,
      config,
      content: [
        { text: "done", type: "text" },
        { data: plan, name: "plan", type: "data" },
        { data: elicitation, name: "elicitation", type: "data" },
        {
          args: { command: "nr test" },
          argsText: '{"command":"nr test"}',
          artifact: action,
          result: "ok",
          toolCallId: action.id,
          toolName: action.kind,
          type: "tool-call",
        },
      ],
      text: "done",
      turnId: "turn-1",
    },
    type: "result",
  },
  { message: "runtime failed", type: "error" },
  { type: "done" },
];

describe("isChatStreamEvent", () => {
  it("accepts every canonical chat stream event variant", () => {
    for (const event of validEvents) {
      expect(isChatStreamEvent(event), event.type).toBe(true);
    }
  });

  it.each([
    ["unknown event", { type: "futureEvent" }],
    ["missing required field", { part: "text", type: "delta" }],
    [
      "wrong delta discriminator",
      { part: "analysis", text: "x", type: "delta" },
    ],
    [
      "wrong action phase discriminator",
      { action: { ...action, phase: "streaming_result" }, type: "tool" },
    ],
    [
      "wrong elicitation kind discriminator",
      {
        elicitation: { ...elicitation, kind: "Approval" },
        type: "elicitation",
      },
    ],
    [
      "wrong plan status discriminator",
      {
        plan: {
          ...plan,
          entries: [{ content: "Validate", status: "inProgress" }],
        },
        type: "plan",
      },
    ],
    [
      "invalid result content part",
      {
        result: {
          chat,
          chatId: chat.id,
          content: [{ data: {}, name: "future-data", type: "data" }],
          text: "",
        },
        type: "result",
      },
    ],
  ])("rejects %s", (_label, event) => {
    expect(isChatStreamEvent(event)).toBe(false);
  });
});
