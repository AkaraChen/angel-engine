import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { EngineEventJson, JsonObject } from "./types";

import {
  EngineEventContentKind,
  EngineEventHistoryRole,
} from "@angel-engine/client-napi";
import { structuredPlanFromToolUse } from "./plan";
import { claudeHistoryToolCall, claudeHistoryToolResult } from "./tooling";
import { asObject } from "./utils";

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
  const value = asObject(message.message);
  const content = value?.content;
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
  if (!Array.isArray(content)) return [];
  if (message.type === "assistant") {
    return content.flatMap((block) =>
      assistantHistoryEvents(conversationId, block, toolUses),
    );
  }
  if (message.type === "user") {
    return content.flatMap((block) =>
      userHistoryEvents(conversationId, block, toolUses),
    );
  }
  return [];
}

function assistantHistoryEvents(
  conversationId: string,
  block: unknown,
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  const value = asObject(block);
  if (!value) return [];
  if (value.type === "text") {
    const text = String(value.text ?? "");
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.Assistant, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  if (value.type === "thinking") {
    const text = String(value.thinking ?? "");
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.Reasoning, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  if (value.type !== "tool_use") return [];

  const id = String(value.id ?? `history-tool-${toolUses.size}`);
  const name = String(value.name ?? "tool");
  const input = asObject(value.input) ?? {};
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
  block: unknown,
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  const value = asObject(block);
  if (!value) return [];
  if (value.type === "text") {
    const text = String(value.text ?? "");
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.User, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  if (value.type !== "tool_result") return [];

  const toolId = String(
    value.tool_use_id ?? `history-tool-result-${toolUses.size}`,
  );
  const toolUse = toolUses.get(toolId);
  return [
    historyReplayChunk(conversationId, EngineEventHistoryRole.Tool, {
      [EngineEventContentKind.Structured]: JSON.stringify(
        claudeHistoryToolResult({
          content: value.content,
          input: toolUse?.input,
          isError: Boolean(value.is_error),
          toolId,
          toolName: toolUse?.name,
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
