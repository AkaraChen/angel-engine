import type {
  ActivePiTurn,
  EngineEventJson,
  PiAgentMessage,
  PiAgentSessionEvent,
  PiModel,
} from "./types.js";

import {
  EngineEventActionPhase,
  EngineEventTurnOutcome,
} from "@angel-engine/client-napi";
import {
  actionObserved,
  actionOutputUpdated,
  assistantDelta,
  failedOutcome,
  reasoningDelta,
  sessionUsageUpdated,
} from "./events.js";

export function eventsFromSdkEvent(
  event: PiAgentSessionEvent,
  active: ActivePiTurn,
  currentModel?: PiModel,
): EngineEventJson[] {
  switch (event.type) {
    case "message_update": {
      const messageEvent = event.assistantMessageEvent;
      if (messageEvent.type === "text_delta") {
        active.sawTextDelta =
          active.sawTextDelta || messageEvent.delta.length > 0;
        return messageEvent.delta
          ? [
              assistantDelta(
                active.conversationId,
                active.turnId,
                messageEvent.delta,
              ),
            ]
          : [];
      }
      if (messageEvent.type === "thinking_delta") {
        active.sawReasoningDelta =
          active.sawReasoningDelta || messageEvent.delta.length > 0;
        return messageEvent.delta
          ? [
              reasoningDelta(
                active.conversationId,
                active.turnId,
                messageEvent.delta,
              ),
            ]
          : [];
      }
      if (messageEvent.type === "done") {
        active.finalMessage = messageEvent.message;
      } else if (messageEvent.type === "error") {
        active.finalMessage = messageEvent.error;
      }
      return [];
    }
    case "message_end":
      return messageEndEvents(event.message, active);
    case "turn_end": {
      const events = messageEndEvents(event.message, active);
      const usageMessage =
        active.finalMessage ??
        (event.message.role === "assistant" ? event.message : undefined);
      const usageEvent = usageMessage
        ? sessionUsageUpdated(active.conversationId, usageMessage, currentModel)
        : undefined;
      return usageEvent ? [...events, usageEvent] : events;
    }
    case "tool_execution_start":
      return [
        actionObserved(active, event.toolCallId, event.toolName, event.args),
      ];
    case "tool_execution_update":
      return [
        actionOutputUpdated(
          active,
          event.toolCallId,
          event.toolName,
          event.partialResult,
          EngineEventActionPhase.StreamingResult,
          false,
        ),
      ];
    case "tool_execution_end":
      return [
        actionOutputUpdated(
          active,
          event.toolCallId,
          event.toolName,
          event.result,
          event.isError
            ? EngineEventActionPhase.Failed
            : EngineEventActionPhase.Completed,
          event.isError,
        ),
      ];
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "message_start":
    case "queue_update":
    case "compaction_start":
    case "compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
    case "session_info_changed":
    case "thinking_level_changed":
      return [];
  }
}

export function piTurnOutcome(
  signal: AbortSignal | undefined,
  active: ActivePiTurn,
): `${EngineEventTurnOutcome}` | EngineEventJson {
  if (signal?.aborted) return EngineEventTurnOutcome.Interrupted;
  const stopReason = active.finalMessage?.stopReason;
  if (stopReason === "aborted") return EngineEventTurnOutcome.Interrupted;
  if (stopReason === "length") return EngineEventTurnOutcome.Exhausted;
  if (stopReason === "error") {
    return failedOutcome(
      active.finalMessage?.errorMessage ?? "Pi turn failed.",
    );
  }
  return EngineEventTurnOutcome.Succeeded;
}

function messageEndEvents(
  message: PiAgentMessage,
  active: ActivePiTurn,
): EngineEventJson[] {
  if (message.role !== "assistant") return [];
  active.finalMessage = message;
  const events: EngineEventJson[] = [];
  for (const block of message.content) {
    if (block.type === "text" && !active.sawTextDelta && block.text) {
      active.sawTextDelta = true;
      events.push(
        assistantDelta(active.conversationId, active.turnId, block.text),
      );
    } else if (
      block.type === "thinking" &&
      !active.sawReasoningDelta &&
      block.thinking
    ) {
      active.sawReasoningDelta = true;
      events.push(
        reasoningDelta(active.conversationId, active.turnId, block.thinking),
      );
    }
  }
  return events;
}
