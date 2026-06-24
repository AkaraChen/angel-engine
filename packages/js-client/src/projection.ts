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
import is from "@sindresorhus/is";
import {
  appendChatTextPart,
  chatPartsText,
  chatPlanPartName,
  chatToolActionToPart,
} from "./utils/index.js";
import { ChatToolRawInputError } from "./utils/tool-raw-input-error.js";
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
  return conversationMessagesWithRawInputPolicy(
    snapshot,
    snapshot.history.hydrated === true,
  );
}

function conversationMessagesWithRawInputPolicy(
  snapshot: ConversationSnapshot,
  tolerateMalformedToolRawInput: boolean,
): ChatHistoryMessage[] {
  return normalizeChatPlanMessages(
    snapshot.messages
      .map((message) =>
        displayMessageToChatMessage(
          message,
          tolerateMalformedToolRawInput && isHydratedHistoryMessage(message),
        ),
      )
      .filter((message) => message.content.length > 0),
  );
}

function isHydratedHistoryMessage(message: DisplayMessageSnapshot): boolean {
  return message.id.startsWith("history-");
}

function displayMessageToChatMessage(
  message: DisplayMessageSnapshot,
  tolerateMalformedToolRawInput: boolean,
): ChatHistoryMessage {
  return {
    content: displayMessagePartsToChatParts(
      message.content,
      tolerateMalformedToolRawInput,
    ),
    id: message.id,
    role:
      message.role === "user" || message.role === "system"
        ? message.role
        : "assistant",
  };
}

function displayMessagePartsToChatParts(
  parts: DisplayMessagePartSnapshot[],
  tolerateMalformedToolRawInput: boolean,
): ChatHistoryMessagePart[] {
  return parts.flatMap((part) =>
    displayMessagePartToChatParts(part, tolerateMalformedToolRawInput),
  );
}

function displayMessagePartToChatParts(
  part: DisplayMessagePartSnapshot,
  tolerateMalformedToolRawInput: boolean,
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
      {
        const elicitation = displayElicitationFromAction(part.action);
        if (elicitation) {
          return [{ data: elicitation, name: "elicitation", type: "data" }];
        }
      }
      const projected = chatPartFromAction(
        toChatAction(part.action),
        tolerateMalformedToolRawInput,
      );
      return projected ? [projected] : [];
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
  const snapshot = result.conversation;
  const config = snapshot
    ? runtimeConfigFromConversationSnapshot(snapshot)
    : undefined;
  const message = snapshot
    ? finalAssistantMessage(conversationMessages(snapshot), result.turnId)
    : undefined;
  const content = message?.content ?? [];

  return {
    config,
    content,
    model: config?.currentModel ?? undefined,
    reasoning: chatPartsText(content, "reasoning") || undefined,
    remoteThreadId: snapshot?.remoteId ?? undefined,
    text: chatPartsText(content, "text"),
    turnId: result.turnId,
  };
}

function finalAssistantMessage(
  messages: ChatHistoryMessage[],
  turnId?: string | null,
) {
  const expectedId = turnId ? `${turnId}:assistant` : undefined;
  if (expectedId) {
    return messages.find(
      (message) => message.role === "assistant" && message.id === expectedId,
    );
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
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
    const displayElicitation = displayElicitationFromAction(part.action);
    if (displayElicitation) {
      return {
        elicitation: displayElicitation,
        type: "elicitation",
      };
    }

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
  if (!action.kind) {
    throw new Error("Tool action is missing kind.");
  }
  const kind = action.kind;
  switch (kind) {
    case "command":
    case "fileChange":
    case "read":
    case "write":
    case "mcpTool":
    case "dynamicTool":
    case "subAgent":
    case "webSearch":
    case "media":
    case "reasoning":
    case "plan":
    case "hostCapability":
      break;
    default:
      throw new Error(`Unknown tool action kind: ${kind}`);
  }
  return {
    elicitationId: action.elicitationId,
    error: action.error,
    id: action.id,
    inputSummary: action.inputSummary,
    kind,
    output: action.output,
    outputText: action.outputText,
    phase: action.phase,
    rawInput: action.rawInput,
    title: action.title,
    turnId: action.turnId,
  };
}

function displayElicitationFromAction(
  action: ToolActionSnapshotLike,
): ChatElicitation | undefined {
  if (action.kind !== "elicitation") return undefined;
  const elicitation = parseChatElicitation(action.rawInput);
  if (!elicitation) {
    throw new Error("Display elicitation action is missing elicitation input.");
  }
  return {
    ...elicitation,
    phase: elicitationPhaseFromAction(action.phase, actionHasOutput(action)),
  };
}

function chatPartFromAction(
  action: ChatToolAction,
  tolerateMalformedRawInput = false,
): ChatHistoryMessagePart | undefined {
  const elicitation = questionElicitationFromAction(action);
  if (elicitation) {
    return {
      data: elicitation,
      name: "elicitation",
      type: "data",
    };
  }
  try {
    return chatToolActionToPart(action);
  } catch (error) {
    if (tolerateMalformedRawInput && error instanceof ChatToolRawInputError) {
      return undefined;
    }
    throw error;
  }
}

function questionElicitationFromAction(
  action: ChatToolAction,
): ChatElicitation | undefined {
  const elicitation = parseChatElicitation(action.rawInput);
  if (!elicitation) return undefined;
  if (!shouldRenderAsQuestionElicitation(elicitation)) return undefined;
  return {
    ...elicitation,
    phase: elicitationPhaseFromAction(action.phase, actionHasOutput(action)),
  };
}

function shouldRenderAsQuestionElicitation(elicitation: ChatElicitation) {
  if (elicitation.kind === "userInput") return true;
  return Boolean(elicitation.questions?.length);
}

function parseChatElicitation(
  rawInput?: string | null,
): ChatElicitation | undefined {
  if (!rawInput) return undefined;
  try {
    const parsed = JSON.parse(rawInput);
    if (
      is.plainObject(parsed) &&
      is.string(parsed.id) &&
      is.string(parsed.kind) &&
      is.string(parsed.phase)
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
  hasOutput: boolean,
) {
  if (hasOutput) return "resolved:Answers";
  if (actionPhase === undefined) {
    throw new Error("Elicitation action is missing phase.");
  }
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
      throw new Error(`Unknown elicitation phase: ${actionPhase}`);
  }
}

function actionHasOutput(action: ToolActionSnapshotLike) {
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
