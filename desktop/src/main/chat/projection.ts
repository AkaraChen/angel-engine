import type {
  ActionOutputSnapshot,
  ActionSnapshot,
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
  DisplayMessageSnapshot,
  DisplayToolActionSnapshot,
  ElicitationSnapshot,
  TurnRunResult,
  TurnSnapshot,
} from "@angel-engine/client-napi";

import type {
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatRuntimeConfig,
  ChatRuntimeConfigOption,
  ChatStreamDelta,
  ChatToolAction,
} from "../../shared/chat";
import { appendChatTextPart, chatToolActionToPart } from "../../shared/chat";

type ToolActionSnapshotLike = ActionSnapshot | DisplayToolActionSnapshot;

export type RawTurnStreamEvent =
  | (ChatStreamDelta & { messagePart?: DisplayMessagePartSnapshot })
  | {
      action: ActionSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      type: "actionObserved";
    }
  | {
      action: ActionSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      type: "actionUpdated";
    }
  | {
      actionId: string;
      content: ActionOutputSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      turnId: string;
      type: "actionOutputDelta";
    }
  | {
      elicitation: ElicitationSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      type: "elicitation";
    };

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
  const modelList = settings?.modelList;
  const availableModes = settings?.availableModes;
  const reasoningLevel = settings?.reasoningLevel;

  return {
    canSetModel: modelList?.canSet ?? Boolean(snapshot.models),
    canSetMode: availableModes?.canSet ?? Boolean(snapshot.modes),
    canSetReasoningEffort: reasoningLevel?.canSet ?? snapshot.reasoning.canSet,
    currentMode:
      availableModes?.currentModeId ??
      snapshot.context.mode ??
      snapshot.modes?.currentModeId ??
      null,
    currentModel:
      modelList?.currentModelId ??
      snapshot.context.model ??
      snapshot.models?.currentModelId ??
      null,
    currentReasoningEffort:
      reasoningLevel?.currentLevel ?? snapshot.reasoning.currentEffort ?? null,
    modes:
      availableModes?.availableModes.map((mode) => ({
        description: mode.description,
        label: mode.name || mode.id,
        value: mode.id,
      })) ??
      snapshot.modes?.availableModes.map((mode) => ({
        description: mode.description,
        label: mode.name || mode.id,
        value: mode.id,
      })) ??
      optionsForConfig(snapshot, "mode"),
    models:
      modelList?.availableModels.map((model) => ({
        description: model.description,
        label: model.name || model.id,
        value: model.id,
      })) ??
      snapshot.models?.availableModels.map((model) => ({
        description: model.description,
        label: model.name || model.id,
        value: model.id,
      })) ??
      optionsForConfig(snapshot, "model"),
    reasoningEfforts: (
      reasoningLevel?.availableLevels ?? snapshot.reasoning.availableEfforts
    ).map((effort) => ({
      label: labelFromConfigValue(effort),
      value: effort,
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

export function createTurnEventProjector(
  onEvent?: (
    event: ChatStreamDelta | { action: ChatToolAction; type: "tool" },
  ) => void,
) {
  const actions = new Map<string, ChatToolAction>();
  const parts: ChatHistoryMessagePart[] = [];

  return {
    content() {
      return parts.map((part) =>
        part.type === "tool-call"
          ? { ...part, artifact: cloneAction(part.artifact) }
          : { ...part },
      );
    },
    handle(event: RawTurnStreamEvent) {
      const messagePart =
        "messagePart" in event ? event.messagePart : undefined;
      const turnId = "turnId" in event ? event.turnId : undefined;
      if (messagePart && acceptDisplayMessagePart(messagePart, turnId)) {
        return;
      }

      if (event.type === "delta") {
        appendChatTextPart(parts, event.part, event.text);
        onEvent?.(event);
        return;
      }

      if (event.type === "actionObserved" || event.type === "actionUpdated") {
        upsertAction(toChatAction(event.action));
        return;
      }

      if (event.type === "actionOutputDelta") {
        const current =
          actions.get(event.actionId) ??
          ({
            id: event.actionId,
            kind: "tool",
            output: [],
            outputText: "",
            phase: "streamingResult",
            title: "Tool call",
            turnId: event.turnId,
          } satisfies ChatToolAction);
        const output = [...(current.output ?? []), event.content];
        upsertAction({
          ...current,
          output,
          outputText: output.map((item) => item.text).join(""),
        });
        return;
      }

      upsertAction(actionFromElicitation(event.elicitation));
    },
  };

  function acceptDisplayMessagePart(
    part: DisplayMessagePartSnapshot,
    turnId?: string,
  ) {
    if (part.type === "text" || part.type === "reasoning") {
      const text = part.text ?? "";
      appendChatTextPart(parts, part.type, text);
      onEvent?.({ part: part.type, text, turnId, type: "delta" });
      return true;
    }

    if (part.type === "tool-call" && part.action) {
      upsertAction(toChatAction(part.action));
      return true;
    }

    return false;
  }

  function upsertAction(action: ChatToolAction) {
    const merged = actions.has(action.id)
      ? mergeToolActions(actions.get(action.id) as ChatToolAction, action)
      : action;
    actions.set(merged.id, merged);
    const part = chatToolActionToPart(merged);
    const index = parts.findIndex(
      (item) =>
        item.type === "tool-call" && item.toolCallId === part.toolCallId,
    );
    if (index === -1) {
      parts.push(part);
    } else {
      parts[index] = part;
    }
    onEvent?.({ action: merged, type: "tool" });
  }
}

function mergeToolActions(
  previous: ChatToolAction,
  next: ChatToolAction,
): ChatToolAction {
  const output = next.output?.length ? next.output : previous.output;
  return {
    ...previous,
    ...next,
    error: next.error ?? previous.error,
    inputSummary: next.inputSummary ?? previous.inputSummary,
    kind:
      next.kind && !(next.kind === "tool" && previous.kind !== "tool")
        ? next.kind
        : previous.kind,
    output,
    outputText: next.outputText?.trim() ? next.outputText : previous.outputText,
    phase: next.phase ?? previous.phase,
    rawInput: next.rawInput ?? previous.rawInput,
    title: next.title ?? previous.title,
  };
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

function optionsForConfig(
  snapshot: ConversationSnapshot,
  category: string,
): ChatRuntimeConfigOption[] {
  return (
    snapshot.configOptions
      .find((option) => option.category === category || option.id === category)
      ?.values.filter((value) => value.value)
      .map((value) => ({
        description: value.description,
        label: value.name || value.value,
        value: value.value,
      })) ?? []
  );
}

function actionFromElicitation(
  elicitation: ElicitationSnapshot,
): ChatToolAction {
  return {
    id: elicitation.id,
    inputSummary:
      elicitation.body ??
      elicitation.questions
        .map((question) => question.question || question.header)
        .filter(Boolean)
        .join("\n") ??
      undefined,
    kind: "elicitation",
    output: [],
    phase: "awaitingDecision",
    rawInput: JSON.stringify(elicitation),
    title: elicitation.title ?? "User input requested",
    turnId: elicitation.turnId ?? undefined,
  };
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

function cloneAction(action: ChatToolAction): ChatToolAction {
  return {
    ...action,
    error: action.error ? { ...action.error } : action.error,
    output: action.output?.map((item) => ({ ...item })),
  };
}

function labelFromConfigValue(value: string) {
  if (value === "xhigh") return "XHigh";
  if (value === "default") return "Default";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
