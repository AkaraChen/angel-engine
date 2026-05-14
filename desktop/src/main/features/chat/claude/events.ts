import type {
  ActionSnapshot,
  ClientEvent,
  ClientUpdate,
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
  TurnRunEvent,
  TurnSnapshot,
} from "@angel-engine/client-napi";
import {
  ClientEventType,
  EngineEventActionKind,
  EngineEventActionOutputKind,
  EngineEventActionPhase,
  EngineEventContentKind,
  TurnRunEventType,
} from "@angel-engine/client-napi";
import type {
  ModelInfo,
  SDKResultMessage,
  SlashCommand,
} from "@anthropic-ai/claude-agent-sdk";

import type {
  ActiveClaudeTurn,
  EngineEventJson,
  SessionConfigValueJson,
  SessionPermissionModeJson,
} from "./types";
import { labelFromValue, uniqueStrings } from "./utils";
import { actionKind, toolInputSummary, toolTitle } from "./tooling";

export function actionObserved(
  active: ActiveClaudeTurn,
  actionId: string,
  toolName: string,
  input: Record<string, unknown>,
): EngineEventJson {
  active.actionIds.add(actionId);
  return {
    ActionObserved: {
      action: {
        error: null,
        id: actionId,
        input: {
          raw: JSON.stringify(input),
          summary: toolInputSummary(toolName, input),
        },
        kind: actionKind(toolName, input),
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
  conversationId: string,
  turnId: string,
  actionId: string,
  title: string,
  kind: `${EngineEventActionKind}`,
  output: string,
  outputKind: `${EngineEventActionOutputKind}`,
): EngineEventJson {
  return {
    ActionObserved: {
      action: {
        error: null,
        id: actionId,
        input: {
          raw: null,
          summary: title,
        },
        kind,
        output: { chunks: [{ [outputKind]: output }] },
        phase: EngineEventActionPhase.Completed,
        remote: { Local: actionId },
        title,
        turn_id: turnId,
      },
      conversation_id: conversationId,
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
      code: "claude.turn_failed",
      message,
      recoverable: true,
    },
  };
}

export function availableCommandsUpdated(
  conversationId: string,
  commands: SlashCommand[],
): EngineEventJson {
  return {
    AvailableCommandsUpdated: {
      commands: commands.map((command) => ({
        description: command.description || "",
        input: command.argumentHint ? { hint: command.argumentHint } : null,
        name: command.name,
      })),
      conversation_id: conversationId,
    },
  };
}

export function sessionModelsUpdated(
  conversationId: string,
  models: { current_model_id: string; available_models: unknown[] },
): EngineEventJson {
  return {
    SessionModelsUpdated: {
      conversation_id: conversationId,
      models,
    },
  };
}

export function modelStateFromModelInfo(
  models: ModelInfo[],
  currentModel?: string,
): { current_model_id: string; available_models: unknown[] } {
  const availableModels = models.map((model) => ({
    description: model.description,
    id: model.value,
    name: model.displayName || model.value,
  }));
  const current =
    currentModel ?? availableModels.find((model) => model.id)?.id ?? "default";
  if (!availableModels.some((model) => model.id === current)) {
    availableModels.unshift({
      description: "",
      id: current,
      name: labelFromValue(current),
    });
  }
  return {
    available_models: availableModels,
    current_model_id: current,
  };
}

export function modelInfoForId(
  models: ModelInfo[],
  modelId: string | undefined,
): ModelInfo | undefined {
  const normalized = modelId?.toLowerCase() ?? "";
  const exact = models.find((model) => model.value === modelId);
  if (exact) return exact;
  if (normalized.includes("opus")) {
    return models.find((model) => model.value === "opus") ?? models[0];
  }
  if (normalized.includes("haiku")) {
    return models.find((model) => model.value === "haiku") ?? models[0];
  }
  return (
    models.find((model) => model.value === "default") ??
    models.find((model) => model.supportsEffort) ??
    models[0]
  );
}

export function permissionModeOptionsFromIds(
  ids: readonly string[],
  currentPermissionMode: string,
): SessionPermissionModeJson[] {
  return uniqueStrings([...ids, currentPermissionMode])
    .filter((id) => id && id !== "bypassPermissions")
    .map((id) => ({
      description: null,
      id,
      name: labelFromValue(id),
    }));
}

export function configValuesFromIds(
  ids: readonly string[],
): SessionConfigValueJson[] {
  return uniqueStrings(ids).map((id) => ({
    description: null,
    name: labelFromValue(id),
    value: id,
  }));
}

export function sessionUsageUpdated(
  conversationId: string,
  message: SDKResultMessage,
): EngineEventJson {
  const usage = message.usage;
  const used =
    Number(usage.input_tokens ?? 0) +
    Number(usage.output_tokens ?? 0) +
    Number(usage.cache_creation_input_tokens ?? 0) +
    Number(usage.cache_read_input_tokens ?? 0);
  const maxWindow = Object.values(message.modelUsage ?? {}).reduce(
    (max, model) => Math.max(max, Number(model.contextWindow ?? 0)),
    0,
  );
  return {
    SessionUsageUpdated: {
      conversation_id: conversationId,
      usage: {
        cost: {
          amount: String(message.total_cost_usd ?? 0),
          currency: "USD",
        },
        size: maxWindow,
        used,
      },
    },
  };
}

export function turnRunEventsFromUpdate(update: ClientUpdate): TurnRunEvent[] {
  const events: TurnRunEvent[] = [];
  for (const event of update.events ?? []) {
    const turnEvent = turnRunEventFromClientEvent(event);
    if (turnEvent) events.push(turnEvent);
  }
  return events;
}

export function activeTurnSnapshot(
  snapshot: ConversationSnapshot,
  turnId: string,
): TurnSnapshot | undefined {
  return snapshot.turns.find((turn) => turn.id === turnId);
}

function turnRunEventFromClientEvent(
  event: ClientEvent,
): TurnRunEvent | undefined {
  switch (event.type) {
    case ClientEventType.AssistantDelta:
      return event.content
        ? {
            messagePart: textPart("text", event.content.text),
            part: "text",
            text: event.content.text,
            turnId: event.turnId,
            type: TurnRunEventType.Delta,
          }
        : undefined;
    case ClientEventType.ReasoningDelta:
      return event.content
        ? {
            messagePart: textPart("reasoning", event.content.text),
            part: "reasoning",
            text: event.content.text,
            turnId: event.turnId,
            type: TurnRunEventType.Delta,
          }
        : undefined;
    case ClientEventType.ActionObserved:
      return event.action
        ? {
            action: event.action,
            messagePart: toolPart(event.action),
            type: TurnRunEventType.ActionObserved,
          }
        : undefined;
    case ClientEventType.ActionUpdated:
      return event.action
        ? {
            action: event.action,
            messagePart: toolPart(event.action),
            type: TurnRunEventType.ActionUpdated,
          }
        : undefined;
    case ClientEventType.ElicitationOpened:
    case ClientEventType.ElicitationUpdated:
      return event.elicitation
        ? {
            elicitation: event.elicitation,
            type: TurnRunEventType.Elicitation,
          }
        : undefined;
    case ClientEventType.PlanUpdated:
      return event.plan
        ? {
            messagePart: {
              plan: event.plan,
              type: "plan",
            },
            plan: event.plan,
            turnId: event.turnId,
            type: TurnRunEventType.PlanUpdated,
          }
        : undefined;
    default:
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
