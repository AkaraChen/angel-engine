import type {
  EngineEventJson,
  PiModel,
  PiThinkingLevel,
  SessionConfigValueJson,
} from "./types.js";

import { contextPatch } from "./context.js";
import { configValuesFromIds } from "./events.js";
import { piThinkingLevelIds } from "./runtime.js";

export function compactEvents(
  events: Array<EngineEventJson | undefined>,
): EngineEventJson[] {
  return events.filter(
    (event): event is EngineEventJson => event !== undefined,
  );
}

export function conversationReadyEvent(
  conversationId: string,
  cwd: string,
  remoteId?: string,
): EngineEventJson {
  return {
    ConversationReady: {
      capabilities: null,
      context: contextPatch([
        {
          Cwd: {
            cwd,
            scope: "Conversation",
          },
        },
      ]),
      id: conversationId,
      remote: remoteId ? { Known: remoteId } : { Local: conversationId },
    },
  };
}

export function reasoningConfigUpdated(
  conversationId: string,
  availableEfforts: SessionConfigValueJson[],
  currentReasoningEffort: PiThinkingLevel,
): EngineEventJson | undefined {
  if (availableEfforts.length === 0) return undefined;
  return {
    SessionConfigOptionsUpdated: {
      conversation_id: conversationId,
      options: [
        {
          category: "thought_level",
          current_value: currentReasoningEffort,
          description: null,
          id: "reasoning_effort",
          name: "Reasoning",
          values: availableEfforts,
        },
      ],
    },
  };
}

export function reasoningEffortState(
  model: PiModel | undefined,
  currentReasoningEffort: PiThinkingLevel,
): {
  availableEfforts: SessionConfigValueJson[];
  currentReasoningEffort: PiThinkingLevel;
} {
  const levels = piThinkingLevelIds.filter((level) => {
    if (level === "off") return true;
    if (!model?.reasoning) return false;
    return model.thinkingLevelMap?.[level] !== null;
  });
  const availableEfforts = configValuesFromIds(levels);
  const effortIsAvailable = availableEfforts.some(
    (effort) => effort.value === currentReasoningEffort,
  );
  return {
    availableEfforts,
    currentReasoningEffort:
      availableEfforts.length > 0 && !effortIsAvailable
        ? (availableEfforts[0].value as PiThinkingLevel)
        : currentReasoningEffort,
  };
}
