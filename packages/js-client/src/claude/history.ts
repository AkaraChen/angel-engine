import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatJsonObject, ChatJsonValue } from "../types.js";
import type { ClaudeToolInput } from "./sdk-types.js";
import type { EngineEventJson } from "./types.js";

import {
  EngineEventContentKind,
  EngineEventHistoryRole,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { structuredPlanFromToolUse } from "./plan.js";
import { claudeHistoryToolCall, claudeHistoryToolResult } from "./tooling.js";

interface HistoryToolUse {
  id: string;
  input: ClaudeToolInput;
  name: string;
}

type ReadonlyJsonObject = { readonly [key: string]: ChatJsonValue };

type AssistantHistoryBlock =
  | { text: string; type: "text" }
  | { thinking: string; type: "thinking" }
  | { id: string; input: object; name: string; type: "tool_use" };

type UserHistoryBlock =
  | { text: string; type: "text" }
  | {
      content: string | object[];
      is_error?: boolean;
      tool_use_id: string;
      type: "tool_result";
    };

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
  if (!is.plainObject(message.message)) {
    throw new Error("Claude history message must be an object.");
  }
  const content = message.message.content;
  if (is.string(content)) {
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
  if (!is.array(content, is.plainObject)) {
    throw new Error(
      "Claude history message content must be a string or array.",
    );
  }
  const blocks = content as readonly ReadonlyJsonObject[];
  if (message.type === "assistant") {
    return blocks.flatMap((block) => {
      if (block.type === "text" && is.string(block.text)) {
        return assistantHistoryEvents(
          conversationId,
          { text: block.text, type: "text" },
          toolUses,
        );
      }
      if (block.type === "thinking" && is.string(block.thinking)) {
        return assistantHistoryEvents(
          conversationId,
          { thinking: block.thinking, type: "thinking" },
          toolUses,
        );
      }
      if (
        block.type === "tool_use" &&
        is.nonEmptyString(block.id) &&
        is.nonEmptyString(block.name) &&
        is.plainObject(block.input)
      ) {
        return assistantHistoryEvents(
          conversationId,
          {
            id: block.id,
            input: block.input,
            name: block.name,
            type: "tool_use",
          },
          toolUses,
        );
      }
      throw new Error("Unknown Claude assistant history block.");
    });
  }
  if (message.type === "user") {
    return blocks.flatMap((block) => {
      if (block.type === "text" && is.string(block.text)) {
        return userHistoryEvents(
          conversationId,
          { text: block.text, type: "text" },
          toolUses,
        );
      }
      if (
        block.type === "tool_result" &&
        is.nonEmptyString(block.tool_use_id) &&
        (is.string(block.content) || is.array(block.content, is.plainObject)) &&
        (block.is_error === undefined || is.boolean(block.is_error))
      ) {
        return userHistoryEvents(
          conversationId,
          {
            content: is.string(block.content)
              ? block.content
              : (block.content as object[]),
            ...(block.is_error === undefined
              ? {}
              : { is_error: block.is_error }),
            tool_use_id: block.tool_use_id,
            type: "tool_result",
          },
          toolUses,
        );
      }
      throw new Error("Unknown Claude user history block.");
    });
  }
  return [];
}

function assistantHistoryEvents(
  conversationId: string,
  block: AssistantHistoryBlock,
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
  const input = block.input as ClaudeToolInput;
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
  block: UserHistoryBlock,
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
  content: ChatJsonObject,
): EngineEventJson {
  return {
    HistoryReplayChunk: {
      conversation_id: conversationId,
      entry: { content, role },
    },
  };
}
