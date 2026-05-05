import type {
  ActionSnapshot,
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
  DisplayMessageSnapshot,
  DisplayToolActionSnapshot,
  TurnRunEvent,
  TurnRunResult,
  TurnSnapshot,
} from "@angel-engine/client-napi";

import type {
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatRuntimeConfig,
  ChatStreamDelta,
  ChatToolAction,
} from "../../shared/chat";
import { appendChatTextPart, chatToolActionToPart } from "../../shared/chat";

type ToolActionSnapshotLike = ActionSnapshot | DisplayToolActionSnapshot;
export type ProjectedTurnEvent =
  | ChatStreamDelta
  | { action: ChatToolAction; type: "tool" };

export function conversationMessages(
  snapshot: ConversationSnapshot,
): ChatHistoryMessage[] {
  return snapshot.messages
    .map(displayMessageToChatMessage)
    .filter((message) => message.content.length > 0);
}

function displayMessageToChatMessage(
  message: DisplayMessageSnapshot,
): ChatHistoryMessage {
  return {
    content: displayMessagePartsToChatParts(message.content),
    id: message.id,
    role:
      message.role === "user" || message.role === "system"
        ? message.role
        : "assistant",
  };
}

function displayMessagePartsToChatParts(
  parts: DisplayMessagePartSnapshot[],
): ChatHistoryMessagePart[] {
  return parts.flatMap(displayMessagePartToChatParts);
}

function displayMessagePartToChatParts(
  part: DisplayMessagePartSnapshot,
): ChatHistoryMessagePart[] {
  switch (part.type) {
    case "reasoning":
    case "text":
      return part.text?.trim() ? [{ text: part.text, type: part.type }] : [];
    case "tool-call":
      return part.action
        ? [chatToolActionToPart(toChatAction(part.action))]
        : [];
    default:
      return part.text?.trim() ? [{ text: part.text, type: "text" }] : [];
  }
}

export function runtimeConfigFromConversationSnapshot(
  snapshot: ConversationSnapshot,
): ChatRuntimeConfig {
  const settings = snapshot.settings;
  const modelList = settings.modelList;
  const availableModes = settings.availableModes;
  const reasoningLevel = settings.reasoningLevel;

  return {
    canSetModel: modelList.canSet,
    canSetMode: availableModes.canSet,
    canSetReasoningEffort: reasoningLevel.canSet,
    currentMode: availableModes.currentModeId ?? null,
    currentModel: modelList.currentModelId ?? null,
    currentReasoningEffort: reasoningLevel.currentLevel ?? null,
    modes: availableModes.availableModes.map((mode) => ({
      description: mode.description,
      label: mode.name || mode.id,
      value: mode.id,
    })),
    models: modelList.availableModels.map((model) => ({
      description: model.description,
      label: model.name || model.id,
      value: model.id,
    })),
    reasoningEfforts: reasoningLevel.availableOptions.map((effort) => ({
      description: effort.description,
      label: effort.label,
      value: effort.value,
    })),
  };
}

export function projectRunResult(result: TurnRunResult) {
  const content = result.message
    ? displayMessagePartsToChatParts(result.message.content)
    : result.turn
      ? contentFromTurnSnapshot(result.turn, result.actions)
      : [];
  if (content.length === 0 && result.text.trim()) {
    content.push({ text: result.text, type: "text" });
  }

  return {
    config: result.conversation
      ? runtimeConfigFromConversationSnapshot(result.conversation)
      : undefined,
    content,
    model: result.model,
    reasoning: result.reasoning,
    remoteThreadId: result.remoteThreadId,
    text: result.text,
    turnId: result.turnId,
  };
}

export function projectTurnRunEvent(
  event: TurnRunEvent,
): ProjectedTurnEvent | undefined {
  if (!("messagePart" in event) || !event.messagePart) {
    return undefined;
  }
  return projectMessagePart(
    event.messagePart,
    "turnId" in event ? event.turnId : undefined,
  );
}

function contentFromTurnSnapshot(
  turn: TurnSnapshot,
  actions: ActionSnapshot[],
): ChatHistoryMessagePart[] {
  const parts: ChatHistoryMessagePart[] = [];
  appendChatTextPart(
    parts,
    "reasoning",
    [turn.reasoningText, turn.planText]
      .filter((text) => Boolean(text?.trim()))
      .join("\n"),
  );
  for (const action of actions) {
    parts.push(chatToolActionToPart(toChatAction(action)));
  }
  appendChatTextPart(parts, "text", turn.outputText ?? "");
  return parts;
}

function projectMessagePart(
  part: DisplayMessagePartSnapshot,
  turnId?: string,
): ProjectedTurnEvent | undefined {
  if (part.type === "text" || part.type === "reasoning") {
    return {
      part: part.type,
      text: part.text ?? "",
      turnId,
      type: "delta",
    };
  }

  if (part.type === "tool-call" && part.action) {
    return {
      action: toChatAction(part.action),
      type: "tool",
    };
  }

  return undefined;
}

function toChatAction(action: ToolActionSnapshotLike): ChatToolAction {
  return {
    error: action.error,
    id: action.id,
    inputSummary: action.inputSummary,
    kind: action.kind,
    output: action.output,
    outputText: action.outputText,
    phase: action.phase,
    rawInput: action.rawInput,
    title: action.title,
    turnId: action.turnId ?? undefined,
  };
}
