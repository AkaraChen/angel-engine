import type {
  ActionSnapshot,
  ClientEvent,
  ClientUpdate,
  DisplayMessagePartSnapshot,
  TurnRunEvent,
  TurnSnapshot,
} from "@angel-engine/client-napi";
import type {
  ActivePiTurn,
  EngineEventJson,
  PiModel,
  PiModelStateJson,
  SessionConfigValueJson,
} from "./types.js";

import {
  EngineEventActionOutputKind,
  EngineEventActionPhase,
  EngineEventContentKind,
  TurnRunEventType,
} from "@angel-engine/client-napi";
import {
  actionKind,
  normalizeToolInput,
  stringifyJson,
  stringifyToolResult,
  toolInputSummary,
  toolOutputKind,
  toolTitle,
} from "./tooling.js";

export function actionObserved(
  active: ActivePiTurn,
  actionId: string,
  toolName: string,
  inputValue: unknown,
): EngineEventJson {
  const input = normalizeToolInput(inputValue);
  active.actionIds.add(actionId);
  return {
    ActionObserved: {
      action: {
        error: null,
        id: actionId,
        input: {
          raw: stringifyJson(input),
          summary: toolInputSummary(toolName, input),
        },
        kind: actionKind(toolName),
        output: { chunks: [] },
        phase: EngineEventActionPhase.Running,
        remote: { Known: actionId },
        title: toolTitle(toolName, input),
        turn_id: active.turnId,
      },
      conversation_id: active.conversationId,
    },
  };
}

export function actionOutputUpdated(
  active: ActivePiTurn,
  actionId: string,
  toolName: string,
  result: unknown,
  phase: `${EngineEventActionPhase}`,
  isError: boolean,
): EngineEventJson {
  const output = stringifyToolResult(result);
  return {
    ActionUpdated: {
      action_id: actionId,
      conversation_id: active.conversationId,
      patch: {
        error: isError
          ? {
              code: "pi.tool_failed",
              message: output,
              recoverable: true,
            }
          : null,
        output_delta: {
          [toolOutputKind(toolName)]: output,
        },
        phase,
        title: null,
      },
    },
  };
}

export function assistantDelta(
  conversationId: string,
  turnId: string,
  text: string,
): EngineEventJson {
  return {
    AssistantDelta: {
      conversation_id: conversationId,
      delta: { [EngineEventContentKind.Text]: text },
      turn_id: turnId,
    },
  };
}

export function reasoningDelta(
  conversationId: string,
  turnId: string,
  text: string,
): EngineEventJson {
  return {
    ReasoningDelta: {
      conversation_id: conversationId,
      delta: { [EngineEventContentKind.Text]: text },
      turn_id: turnId,
    },
  };
}

export function turnTerminal(
  conversationId: string,
  turnId: string,
  outcome: unknown,
): EngineEventJson {
  return {
    TurnTerminal: {
      conversation_id: conversationId,
      outcome,
      turn_id: turnId,
    },
  };
}

export function failedOutcome(message: string): EngineEventJson {
  return {
    Failed: {
      code: "pi.turn_failed",
      message,
      recoverable: true,
    },
  };
}

export function availableCommandsUpdated(
  conversationId: string,
  commands: Array<{ description?: string; name: string }>,
): EngineEventJson {
  return {
    AvailableCommandsUpdated: {
      commands: commands.map((command) => ({
        description: command.description ?? "",
        input: null,
        name: command.name,
      })),
      conversation_id: conversationId,
    },
  };
}

export function sessionModelsUpdated(
  conversationId: string,
  models: PiModelStateJson,
): EngineEventJson {
  return {
    SessionModelsUpdated: {
      conversation_id: conversationId,
      models,
    },
  };
}

export function modelStateFromModels(
  models: PiModel[],
  currentModel?: PiModel,
): PiModelStateJson {
  const availableModels = models.map((model) => ({
    description: `${model.provider}/${model.id}`,
    id: piModelId(model),
    name: model.name || piModelId(model),
  }));
  const current = currentModel
    ? piModelId(currentModel)
    : availableModels[0]?.id;
  if (!current) {
    throw new Error("Pi model list is empty.");
  }
  if (!availableModels.some((model) => model.id === current)) {
    availableModels.unshift({
      description: current,
      id: current,
      name: current,
    });
  }
  return {
    available_models: availableModels,
    current_model_id: current,
  };
}

export function piModelId(model: PiModel): string {
  return `${model.provider}/${model.id}`;
}

export function configValuesFromIds(
  ids: readonly string[],
): SessionConfigValueJson[] {
  return [...new Set(ids)].map((id) => ({
    description: null,
    name: labelFromValue(id),
    value: id,
  }));
}

export function sessionUsageUpdated(
  conversationId: string,
  message: Extract<ActivePiTurn["finalMessage"], object>,
  currentModel?: PiModel,
): EngineEventJson | undefined {
  const usage = message.usage;
  if (!usage) return undefined;
  return {
    SessionUsageUpdated: {
      conversation_id: conversationId,
      usage: {
        cost: {
          amount: String(usage.cost.total),
          currency: "USD",
        },
        size: currentModel?.contextWindow ?? 0,
        used: usage.totalTokens,
      },
    },
  };
}

export function turnRunEventsFromUpdate(update: ClientUpdate): TurnRunEvent[] {
  const clientEvents = update.events;
  if (!clientEvents) {
    throw new Error("Client update is missing events.");
  }
  const events: TurnRunEvent[] = [];
  for (const event of clientEvents) {
    const turnEvent = turnRunEventFromClientEvent(event);
    if (turnEvent) events.push(turnEvent);
  }
  return events;
}

export function activeTurnSnapshot(
  snapshot: { turns: TurnSnapshot[] },
  turnId: string,
): TurnSnapshot | undefined {
  return snapshot.turns.find((turn) => turn.id === turnId);
}

function turnRunEventFromClientEvent(
  event: ClientEvent,
): TurnRunEvent | undefined {
  switch (event.type) {
    case "assistantDelta":
      return event.content
        ? {
            messagePart: textPart("text", event.content.text),
            part: "text",
            text: event.content.text,
            turnId: event.turnId,
            type: TurnRunEventType.Delta,
          }
        : undefined;
    case "reasoningDelta":
      return event.content
        ? {
            messagePart: textPart("reasoning", event.content.text),
            part: "reasoning",
            text: event.content.text,
            turnId: event.turnId,
            type: TurnRunEventType.Delta,
          }
        : undefined;
    case "actionObserved":
      return event.action
        ? {
            messagePart: toolPart(event.action),
            type: TurnRunEventType.ActionObserved,
          }
        : undefined;
    case "actionUpdated":
      return event.action
        ? {
            messagePart: toolPart(event.action),
            type: TurnRunEventType.ActionUpdated,
          }
        : undefined;
    case "elicitationOpened":
    case "elicitationUpdated":
    case "planUpdated":
    case "availableCommandsUpdated":
    case "availableSkillsUpdated":
    case "contextUpdated":
    case "conversationDiscovered":
    case "conversationReady":
    case "conversationUpdated":
    case "historyUpdated":
    case "log":
    case "planDelta":
    case "runtimeAuthRequired":
    case "runtimeFaulted":
    case "runtimeReady":
    case "sessionUsageUpdated":
    case "turnStarted":
    case "turnSteered":
    case "turnTerminal":
      return undefined;
  }
}

function textPart(
  type: "reasoning" | "text",
  text: string,
): DisplayMessagePartSnapshot {
  return { text, type };
}

function toolPart(action: ActionSnapshot): DisplayMessagePartSnapshot {
  return {
    action: {
      error: action.error ?? undefined,
      id: action.id,
      inputSummary: action.inputSummary ?? undefined,
      kind: action.kind,
      output: action.output,
      outputText: action.outputText,
      phase: action.phase,
      rawInput: action.rawInput ?? undefined,
      title: action.title ?? undefined,
      turnId: action.turnId,
    },
    type: "tool-call",
  };
}

function labelFromValue(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
