import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { ActiveClaudeTurn, EngineEventJson } from "./types.js";
import {
  EngineEventActionPhase,
  EngineEventTurnOutcome,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import {
  actionObserved,
  assistantDelta,
  failedOutcome,
  reasoningDelta,
  sessionUsageUpdated,
  turnTerminal,
} from "./events.js";
import { planEventsFromToolUse } from "./plan.js";
import {
  isClaudeAssistantToolUseBlock,
  isClaudeContentBlockDeltaEvent,
  isClaudeContentBlockStartEvent,
  isClaudeUserToolResultBlock,
  type ClaudeToolInput,
} from "./sdk-types.js";
import { stringifyToolResult, toolOutputKind } from "./tooling.js";

export function isClaudeInitMessage(
  message: Extract<SDKMessage, { type: "system" }>,
): message is SDKSystemMessage {
  return message.subtype === "init";
}

export function partialAssistantEvents(
  message: SDKPartialAssistantMessage,
  active: ActiveClaudeTurn,
): EngineEventJson[] {
  const event = message.event;
  if (isClaudeContentBlockStartEvent(event)) {
    const contentBlock = event.content_block;
    if (isClaudeAssistantToolUseBlock(contentBlock)) {
      if (!is.nonEmptyString(contentBlock.id)) {
        throw new Error("Claude tool_use block is missing id.");
      }
      if (!is.plainObject(contentBlock.input)) {
        throw new Error("Claude tool_use block input must be an object.");
      }
      return [
        actionObserved(
          active,
          contentBlock.id,
          contentBlock.name,
          contentBlock.input as ClaudeToolInput,
        ),
      ];
    }
    return [];
  }

  if (!isClaudeContentBlockDeltaEvent(event)) return [];
  const delta = event.delta;
  if (delta.type === "text_delta") {
    const text = delta.text;
    active.sawTextDelta = active.sawTextDelta || text.length > 0;
    return text
      ? [assistantDelta(active.conversationId, active.turnId, text)]
      : [];
  }
  if (delta.type === "thinking_delta") {
    const text = delta.thinking;
    active.sawReasoningDelta = active.sawReasoningDelta || text.length > 0;
    return text
      ? [reasoningDelta(active.conversationId, active.turnId, text)]
      : [];
  }
  return [];
}

export function assistantEvents(
  message: SDKAssistantMessage,
  active: ActiveClaudeTurn,
): EngineEventJson[] {
  const events: EngineEventJson[] = [];
  const content = message.message.content;
  for (const block of content) {
    if (block.type === "text" && !active.sawTextDelta) {
      const text = block.text;
      if (text) {
        events.push(assistantDelta(active.conversationId, active.turnId, text));
      }
    } else if (block.type === "thinking" && !active.sawReasoningDelta) {
      const text = block.thinking;
      if (text) {
        events.push(reasoningDelta(active.conversationId, active.turnId, text));
      }
    } else if (isClaudeAssistantToolUseBlock(block)) {
      if (!is.nonEmptyString(block.id)) {
        throw new Error("Claude tool_use block is missing id.");
      }
      if (!is.plainObject(block.input)) {
        throw new Error("Claude tool_use block input must be an object.");
      }
      const toolName = block.name;
      const input = block.input as ClaudeToolInput;
      events.push(actionObserved(active, block.id, toolName, input));
      events.push(...planEventsFromToolUse(active, toolName, input));
    }
  }
  return events;
}

export function userMessageEvents(
  message: SDKUserMessage,
  active: ActiveClaudeTurn,
): EngineEventJson[] {
  const content = message.message.content;
  const events: EngineEventJson[] = [];
  for (const block of content) {
    if (!isClaudeUserToolResultBlock(block)) continue;
    if (!is.nonEmptyString(block.tool_use_id)) {
      throw new Error("Claude tool_result block is missing tool_use_id.");
    }
    const actionId = block.tool_use_id;
    const output = stringifyToolResult(block.content);
    if (block.is_error && !output) {
      throw new Error("Claude tool error result is missing content.");
    }
    events.push({
      ActionUpdated: {
        action_id: actionId,
        conversation_id: active.conversationId,
        patch: {
          error: block.is_error
            ? {
                code: "claude.tool_failed",
                message: output,
                recoverable: true,
              }
            : null,
          output_delta: {
            [toolOutputKind(actionId, output, active)]: output,
          },
          phase: block.is_error
            ? EngineEventActionPhase.Failed
            : EngineEventActionPhase.Completed,
          title: null,
        },
      },
    });
  }
  return events;
}

export function resultEvents(
  message: SDKResultMessage,
  active: ActiveClaudeTurn,
): EngineEventJson[] {
  if (message.subtype === "success" && !active.sawTextDelta && message.result) {
    active.sawTextDelta = true;
    return [
      assistantDelta(active.conversationId, active.turnId, message.result),
      turnTerminal(
        active.conversationId,
        active.turnId,
        EngineEventTurnOutcome.Succeeded,
      ),
      sessionUsageUpdated(active.conversationId, message),
    ];
  }
  return [
    turnTerminal(
      active.conversationId,
      active.turnId,
      message.subtype === "success"
        ? EngineEventTurnOutcome.Succeeded
        : failedOutcome(message.errors?.join("\n") || message.subtype),
    ),
    sessionUsageUpdated(active.conversationId, message),
  ];
}
