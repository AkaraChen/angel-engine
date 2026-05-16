import type {
  ActionSnapshot,
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
  DisplayMessageSnapshot,
  DisplayPlanSnapshot,
  DisplayToolActionSnapshot,
  ElicitationSnapshot,
  TurnRunEvent,
  TurnRunResult,
  TurnSnapshot,
} from "@angel-engine/client-napi";
import type {
  ChatElicitation,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatPlanData,
  ChatPlanEntryStatus,
  ChatRuntimeConfig,
  ChatStreamDelta,
  ChatToolAction,
} from "./types.js";

import { TurnRunEventType } from "@angel-engine/client-napi";
import {
  appendChatTextPart,
  chatPlanPartName,
  chatToolActionToPart,
} from "./utils/index.js";
import { imageDataUrl } from "./utils/media.js";
import { isChatPlanData, normalizeChatPlanMessages } from "./utils/plans.js";

type ToolActionSnapshotLike = ActionSnapshot | DisplayToolActionSnapshot;
export type ProjectedTurnEvent =
  | ChatStreamDelta
  | { plan: ChatPlanData; turnId?: string; type: "plan" }
  | { elicitation: ChatElicitation; type: "elicitation" }
  | { action: ChatToolAction; type: "tool" }
  | { action: ChatToolAction; type: "toolDelta" };

export function conversationMessages(
  snapshot: ConversationSnapshot,
): ChatHistoryMessage[] {
  return normalizeChatPlanMessages(
    snapshot.messages
      .map(displayMessageToChatMessage)
      .filter((message) => message.content.length > 0),
  );
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
      if (typeof part.text !== "string") {
        throw new Error(`Display ${part.type} part is missing text.`);
      }
      return part.text ? [{ text: part.text, type: part.type }] : [];
    case "tool-call":
      if (!part.action) {
        throw new Error("Display tool-call part is missing action.");
      }
      return [chatPartFromAction(toChatAction(part.action))];
    case "plan":
      if (!part.plan) {
        throw new Error("Display plan part is missing plan.");
      }
      return planMessagePart(part.plan);
    case "image":
      if (!part.data || !part.mimeType?.startsWith("image/")) {
        throw new Error("Display image part is missing image data.");
      }
      return [
        {
          filename: part.name ?? undefined,
          image: imageDataUrl(part.data, part.mimeType),
          mimeType: part.mimeType,
          type: "image",
        },
      ];
    case "file":
      if (!part.data || !part.mimeType) {
        throw new Error("Display file part is missing file data.");
      }
      return [
        {
          data: part.data,
          filename: part.name ?? undefined,
          mimeType: part.mimeType,
          type: "file",
        },
      ];
    default:
      if (typeof part.text !== "string") {
        throw new Error("Display message part is not projectable.");
      }
      return part.text ? [{ text: part.text, type: "text" }] : [];
  }
}

export function runtimeConfigFromConversationSnapshot(
  snapshot: ConversationSnapshot,
): ChatRuntimeConfig {
  const settings = snapshot.settings;
  const modelList = settings.modelList;
  const availableModes = settings.availableModes;
  const permissionModes = settings.permissionModes;
  const reasoningLevel = settings.reasoningLevel;
  const currentMode =
    snapshot.agentState?.currentMode ?? availableModes.currentModeId ?? null;
  const currentPermissionMode =
    snapshot.agentState?.currentPermissionMode ??
    permissionModes.currentModeId ??
    null;

  return {
    agentState: {
      currentMode,
      currentPermissionMode,
    },
    canSetModel: modelList.canSet,
    canSetMode: availableModes.canSet,
    canSetPermissionMode: permissionModes.canSet,
    canSetReasoningEffort: reasoningLevel.canSet,
    availableCommands: snapshot.availableCommands,
    currentMode,
    currentModel: modelList.currentModelId ?? null,
    currentPermissionMode,
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
    permissionModes: permissionModes.availableModes.map((mode) => ({
      description: mode.description,
      label: mode.name || mode.id,
      value: mode.id,
    })),
    reasoningEfforts: reasoningLevel.availableOptions.map((effort) => ({
      description: effort.description,
      label: effort.label,
      value: effort.value,
    })),
  };
}

export function projectTurnRunResult(result: TurnRunResult) {
  let content: ChatHistoryMessagePart[] = [];
  if (result.message) {
    content = displayMessagePartsToChatParts(result.message.content);
  } else if (result.turn) {
    content = contentFromTurnSnapshot(result.turn, result.actions);
  }

  if (content.length === 0 && result.text) {
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
  if (
    event.type === TurnRunEventType.ActionOutputDelta &&
    event.messagePart?.type === "tool-call" &&
    event.messagePart.action
  ) {
    return {
      action: toChatAction(event.messagePart.action),
      type: "toolDelta",
    };
  }

  if ("messagePart" in event && event.messagePart) {
    const projected = projectMessagePart(
      event.messagePart,
      "turnId" in event ? event.turnId : undefined,
    );
    if (projected) return projected;
  }

  if (event.type === "elicitation" && event.elicitation) {
    return {
      elicitation: toChatElicitation(event.elicitation),
      type: "elicitation",
    };
  }

  return undefined;
}

function contentFromTurnSnapshot(
  turn: TurnSnapshot,
  actions: ActionSnapshot[],
): ChatHistoryMessagePart[] {
  const parts: ChatHistoryMessagePart[] = [];
  appendChatTextPart(parts, "reasoning", turn.reasoningText ?? "");
  const plan = planFromTurnSnapshot(turn);
  if (plan) parts.push(planMessagePartData(plan));
  for (const action of actions) {
    parts.push(chatPartFromAction(toChatAction(action)));
  }
  const todo = todoFromTurnSnapshot(turn);
  if (todo) parts.push(planMessagePartData(todo));
  appendChatTextPart(parts, "text", turn.outputText ?? "");
  return parts;
}

function projectMessagePart(
  part: DisplayMessagePartSnapshot,
  turnId?: string,
): ProjectedTurnEvent | undefined {
  if (part.type === "text" || part.type === "reasoning") {
    if (typeof part.text !== "string") {
      throw new Error(`Display ${part.type} part is missing text.`);
    }
    return {
      part: part.type,
      text: part.text,
      turnId,
      type: "delta",
    };
  }

  if (part.type === "tool-call" && part.action) {
    const action = toChatAction(part.action);
    const elicitation = questionElicitationFromAction(action);
    if (elicitation) {
      return {
        elicitation,
        type: "elicitation",
      };
    }

    return {
      action,
      type: "tool",
    };
  }

  if (part.type === "plan" && part.plan) {
    return {
      plan: toChatPlanData(part.plan),
      turnId,
      type: "plan",
    };
  }

  return undefined;
}

function planMessagePart(plan: unknown): ChatHistoryMessagePart[] {
  const data = toChatPlanData(plan as DisplayPlanSnapshot);
  return isChatPlanData(data) ? [planMessagePartData(data)] : [];
}

function planMessagePartData(plan: ChatPlanData): ChatHistoryMessagePart {
  return {
    data: plan,
    name: chatPlanPartName(plan),
    type: "data",
  };
}

function planFromTurnSnapshot(turn: TurnSnapshot): ChatPlanData | undefined {
  const data: ChatPlanData = {
    entries: (turn.plan ?? []).map((entry) => ({
      content: entry.content,
      status: entry.status,
    })),
    kind: "review",
    path: turn.planPath ?? null,
    text: turn.planText ?? "",
  };
  return isEmptyPlan(data) ? undefined : data;
}

function todoFromTurnSnapshot(turn: TurnSnapshot): ChatPlanData | undefined {
  const data: ChatPlanData = {
    entries: (turn.todo ?? []).map((entry) => ({
      content: entry.content,
      status: entry.status,
    })),
    kind: "todo",
    path: null,
    text: "",
  };
  return isEmptyPlan(data) ? undefined : data;
}

function toChatPlanData(plan: DisplayPlanSnapshot): ChatPlanData {
  const kind = plan.kind === "todo" ? "todo" : "review";
  return {
    entries: plan.entries.map((entry) => ({
      content: entry.content,
      status: entry.status as ChatPlanEntryStatus,
    })),
    kind,
    path: plan.path ?? null,
    text: plan.text,
  };
}

function isEmptyPlan(plan: ChatPlanData) {
  return (
    plan.entries.length === 0 &&
    !plan.text &&
    !(typeof plan.path === "string" && plan.path)
  );
}

function toChatAction(action: ToolActionSnapshotLike): ChatToolAction {
  if (!action.turnId) {
    throw new Error("Tool action is missing turnId.");
  }
  if (!action.title) {
    throw new Error("Tool action is missing title.");
  }
  return {
    elicitationId: action.elicitationId,
    error: action.error,
    id: action.id,
    inputSummary: action.inputSummary,
    kind: action.kind as ChatToolAction["kind"],
    output: action.output,
    outputText: action.outputText,
    phase: action.phase,
    rawInput: action.rawInput,
    title: action.title,
    turnId: action.turnId,
  };
}

function chatPartFromAction(action: ChatToolAction): ChatHistoryMessagePart {
  const elicitation = questionElicitationFromAction(action);
  if (elicitation) {
    return {
      data: elicitation,
      name: "elicitation",
      type: "data",
    };
  }
  return chatToolActionToPart(action);
}

function questionElicitationFromAction(
  action: ChatToolAction,
): ChatElicitation | undefined {
  const elicitation = parseChatElicitation(action.rawInput);
  if (!elicitation) return undefined;
  if (!shouldRenderAsQuestionElicitation(elicitation)) return undefined;
  return {
    ...elicitation,
    phase: elicitationPhaseFromAction(
      action.phase,
      elicitation.phase,
      actionHasOutput(action),
    ),
  };
}

function shouldRenderAsQuestionElicitation(elicitation: ChatElicitation) {
  return (
    elicitation.kind === "userInput" || (elicitation.questions?.length ?? 0) > 0
  );
}

function parseChatElicitation(
  rawInput?: string | null,
): ChatElicitation | undefined {
  if (!rawInput) return undefined;
  try {
    const parsed: unknown = JSON.parse(rawInput);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Partial<ChatElicitation>).id === "string" &&
      typeof (parsed as Partial<ChatElicitation>).kind === "string" &&
      typeof (parsed as Partial<ChatElicitation>).phase === "string"
    ) {
      return parsed as ChatElicitation;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function elicitationPhaseFromAction(
  actionPhase: string | undefined,
  fallback: string,
  hasOutput: boolean,
) {
  if (hasOutput) return "resolved:Answers";
  switch (actionPhase) {
    case "completed":
      return "resolved:Answers";
    case "cancelled":
    case "declined":
    case "failed":
      return "cancelled";
    case "awaitingDecision":
      return "open";
    default:
      return fallback;
  }
}

function actionHasOutput(action: ChatToolAction) {
  return Boolean(
    action.outputText || action.output?.some((output) => output.text),
  );
}

function toChatElicitation(elicitation: ElicitationSnapshot): ChatElicitation {
  return {
    actionId: elicitation.actionId ?? null,
    body: elicitation.body ?? null,
    choices: elicitation.choices,
    id: elicitation.id,
    kind: elicitation.kind,
    phase: elicitation.phase,
    questions: elicitation.questions.map((question) => ({
      header: question.header || undefined,
      id: question.id,
      isOther: question.isOther,
      isSecret: question.isSecret,
      options: question.options.map((option) => ({
        description: option.description || undefined,
        label: option.label,
      })),
      question: question.question || undefined,
    })),
    title: elicitation.title ?? null,
    turnId: elicitation.turnId ?? null,
  };
}
