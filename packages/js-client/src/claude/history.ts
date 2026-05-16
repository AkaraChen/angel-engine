import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { EngineEventJson, JsonObject } from "./types.js";

import {
  EngineEventContentKind,
  EngineEventHistoryRole,
} from "@angel-engine/client-napi";
import { type } from "arktype";
import { structuredPlanFromToolUse } from "./plan.js";
import { claudeHistoryToolCall, claudeHistoryToolResult } from "./tooling.js";

interface HistoryToolUse {
  id: string;
  input: JsonObject;
  name: string;
}

export function historyEventsFromSessionMessages(
  conversationId: string,
  messages: SessionMessage[],
): EngineEventJson[] {
  const toolUses = new Map<string, HistoryToolUse>();
  return messages.flatMap((message) =>
    historyEventsFromSessionMessage(conversationId, message, toolUses),
  );
}

function historyEventsFromSessionMessage(
  conversationId: string,
  message: SessionMessage,
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  const content = type({ content: "string | object[]" }).assert(
    message.message,
  ).content;
  if (typeof content === "string") {
    const role =
      message.type === "user"
        ? EngineEventHistoryRole.User
        : EngineEventHistoryRole.Assistant;
    return content
      ? [
          historyReplayChunk(conversationId, role, {
            [EngineEventContentKind.Text]: content,
          }),
        ]
      : [];
  }
  if (message.type === "assistant") {
    return type({ type: "'text'", text: "string" })
      .or({ type: "'thinking'", thinking: "string" })
      .or({
        type: "'tool_use'",
        id: "string > 0",
        name: "string > 0",
        input: "object",
      })
      .array()
      .assert(content)
      .flatMap((block) =>
        assistantHistoryEvents(conversationId, block, toolUses),
      );
  }
  if (message.type === "user") {
    return type({ type: "'text'", text: "string" })
      .or({
        type: "'tool_result'",
        tool_use_id: "string > 0",
        content: "string | object[]",
        "is_error?": "boolean",
      })
      .array()
      .assert(content)
      .flatMap((block) => userHistoryEvents(conversationId, block, toolUses));
  }
  return [];
}

function assistantHistoryEvents(
  conversationId: string,
  block:
    | { text: string; type: "text" }
    | { thinking: string; type: "thinking" }
    | { id: string; input: object; name: string; type: "tool_use" },
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  if (block.type === "text") {
    const text = block.text;
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.Assistant, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  if (block.type === "thinking") {
    const text = block.thinking;
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.Reasoning, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  const id = block.id;
  const name = block.name;
  const input = block.input as JsonObject;
  toolUses.set(id, { id, input, name });

  const plan = structuredPlanFromToolUse(name, input);
  if (plan) {
    return [
      historyReplayChunk(conversationId, EngineEventHistoryRole.Assistant, {
        [EngineEventContentKind.Structured]: JSON.stringify(plan),
      }),
    ];
  }

  return [
    historyReplayChunk(conversationId, EngineEventHistoryRole.Tool, {
      [EngineEventContentKind.Structured]: JSON.stringify(
        claudeHistoryToolCall(id, name, input),
      ),
    }),
  ];
}

function userHistoryEvents(
  conversationId: string,
  block:
    | { text: string; type: "text" }
    | {
        content: string | object[];
        is_error?: boolean;
        tool_use_id: string;
        type: "tool_result";
      },
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  if (block.type === "text") {
    const text = block.text;
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.User, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  const toolId = block.tool_use_id;
  const toolUse = toolUses.get(toolId);
  if (!toolUse) {
    throw new Error(
      `Claude history tool result has no matching tool_use: ${toolId}`,
    );
  }
  return [
    historyReplayChunk(conversationId, EngineEventHistoryRole.Tool, {
      [EngineEventContentKind.Structured]: JSON.stringify(
        claudeHistoryToolResult({
          content: block.content,
          input: toolUse.input,
          isError: block.is_error === true,
          toolId,
          toolName: toolUse.name,
        }),
      ),
    }),
  ];
}

function historyReplayChunk(
  conversationId: string,
  role: `${EngineEventHistoryRole}`,
  content: JsonObject,
): EngineEventJson {
  return {
    HistoryReplayChunk: {
      conversation_id: conversationId,
      entry: { content, role },
    },
  };
}
