import type {
  ChatElicitation,
  ChatElicitationResponse,
  ChatHistoryMessagePart,
  ChatPlanData,
  ChatToolAction,
  ChatToolActionOutput,
  ChatToolActionPhase,
} from "@shared/chat";
import {
  chatPlanPartName,
  chatToolActionToPart,
  cloneChatPlanData,
  isChatPlanPart,
  isChatToolAction,
  upsertChatElicitationPart,
} from "@shared/chat";
import is from "@sindresorhus/is";
import { chatPlanKind } from "./chat-run-plan";

type LocallyResolvedElicitationPhase = "cancelled" | "resolved:Answers";
const LOCAL_ELICITATION_PHASE_BY_RESPONSE_TYPE = {
  allow: "resolved:Answers",
  allowForSession: "resolved:Answers",
  answers: "resolved:Answers",
  cancel: "cancelled",
  deny: "cancelled",
  dynamicToolResult: "resolved:Answers",
  externalComplete: "resolved:Answers",
  raw: "resolved:Answers",
} satisfies Record<
  ChatElicitationResponse["type"],
  LocallyResolvedElicitationPhase
>;
const OPTIMISTIC_TOOL_PHASE_BY_ELICITATION_RESPONSE_TYPE = {
  allow: "running",
  allowForSession: "running",
  answers: "running",
  cancel: "cancelled",
  deny: "declined",
  dynamicToolResult: "running",
  externalComplete: "running",
  raw: "running",
} satisfies Record<ChatElicitationResponse["type"], ChatToolActionPhase>;

export function upsertToolActionPart(
  parts: ChatHistoryMessagePart[],
  action: ChatToolAction,
) {
  const questionElicitation = questionElicitationFromAction(action);
  if (questionElicitation) {
    return upsertElicitationPart(parts, questionElicitation);
  }

  if (
    isEmptyHostCapabilityAction(action) &&
    parts.some((part) => partReferencesElicitationAction(part, action.id))
  ) {
    return undefined;
  }

  const nextPart = chatToolActionToPart(action);
  const index = parts.findIndex(
    (part) =>
      part.type === "tool-call" && part.toolCallId === nextPart.toolCallId,
  );

  if (index === -1) {
    parts.push(nextPart);
    return parts.length - 1;
  }

  parts[index] = nextPart;
  return index;
}

export function appendToolActionDeltaPart(
  parts: ChatHistoryMessagePart[],
  action: ChatToolAction,
): { index: number | undefined; textLength: number } {
  const deltaText = toolActionDeltaText(action);
  const index = parts.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === action.id,
  );

  if (index === -1) {
    return {
      index: upsertToolActionPart(parts, action),
      textLength: deltaText.length,
    };
  }

  const previous = parts[index];
  if (previous.type !== "tool-call" || !isChatToolAction(previous.artifact)) {
    return {
      index: upsertToolActionPart(parts, action),
      textLength: deltaText.length,
    };
  }

  const previousAction: ChatToolAction = previous.artifact;
  const output: ChatToolActionOutput[] = previousAction.output ?? [];
  if (action.output !== undefined) {
    output.push(...action.output);
  }
  let previousOutputText = previousAction.outputText;
  if (previousOutputText === undefined) {
    if (previousAction.output === undefined) {
      throw new Error("Tool action delta is missing previous output.");
    }
    previousOutputText = previousAction.output
      .map((chunk: ChatToolActionOutput) => chunk.text)
      .join("");
  }
  upsertToolActionPart(parts, {
    ...previousAction,
    ...action,
    output,
    outputText: `${previousOutputText}${deltaText}`,
  });
  return { index, textLength: deltaText.length };
}

function toolActionDeltaText(action: ChatToolAction) {
  if (action.outputText !== undefined) return action.outputText;
  if (action.output === undefined) {
    throw new Error("Tool action delta is missing output.");
  }
  return action.output
    .map((chunk: ChatToolActionOutput) => chunk.text)
    .join("");
}

export function upsertTurnPlanPartAtEnd(
  parts: ChatHistoryMessagePart[],
  plan: ChatPlanData,
) {
  const nextPart: ChatHistoryMessagePart = {
    data: cloneChatPlanData(plan),
    name: chatPlanPartName(plan),
    type: "data",
  };
  const index = parts.findIndex(
    (part) =>
      isChatPlanPart(part) && chatPlanKind(part.data) === chatPlanKind(plan),
  );
  const touchedIndex = index === -1 ? parts.length : index;
  if (index !== -1) parts.splice(index, 1);
  parts.push(nextPart);
  return touchedIndex;
}

export function upsertElicitationPart(
  parts: ChatHistoryMessagePart[],
  elicitation: ChatElicitation,
) {
  if (is.nonEmptyString(elicitation.actionId)) {
    removeBackingHostCapabilityPart(parts, elicitation.actionId);
  }
  upsertChatElicitationPart(
    parts,
    preserveResolvedElicitationPhase(parts, elicitation),
  );
  return 0;
}

function preserveResolvedElicitationPhase(
  parts: ChatHistoryMessagePart[],
  elicitation: ChatElicitation,
) {
  if (elicitation.phase !== "open") return elicitation;
  const previous = parts.find(
    (part) =>
      part.type === "data" &&
      part.name === "elicitation" &&
      part.data.id === elicitation.id,
  );
  if (
    previous?.type !== "data" ||
    previous.name !== "elicitation" ||
    !isClosedElicitationPhase(previous.data.phase)
  ) {
    return elicitation;
  }
  return {
    ...elicitation,
    phase: previous.data.phase,
  };
}

export function resolveElicitationPartLocally(
  parts: ChatHistoryMessagePart[],
  elicitationId: string,
  response: ChatElicitationResponse,
) {
  const phase = LOCAL_ELICITATION_PHASE_BY_RESPONSE_TYPE[response.type];
  for (const part of parts) {
    if (
      part.type === "data" &&
      part.name === "elicitation" &&
      part.data.id === elicitationId
    ) {
      part.data = {
        ...part.data,
        phase,
      };
    }
    if (
      part.type === "tool-call" &&
      part.toolCallId === elicitationId &&
      isChatToolAction(part.artifact) &&
      part.artifact.phase === "awaitingDecision"
    ) {
      part.artifact = {
        ...part.artifact,
        phase:
          OPTIMISTIC_TOOL_PHASE_BY_ELICITATION_RESPONSE_TYPE[response.type],
      };
    }
  }
  return 0;
}

export function markToolActionPermissionApprovedLocally(
  parts: ChatHistoryMessagePart[],
  actionId: string,
) {
  const index = parts.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === actionId,
  );
  const part = parts[index];
  if (part?.type !== "tool-call" || !isChatToolAction(part.artifact)) return;

  parts[index] = {
    ...part,
    artifact: {
      ...part.artifact,
      phase: "running",
    },
  };
}

function removeBackingHostCapabilityPart(
  parts: ChatHistoryMessagePart[],
  actionId: string,
) {
  const index = parts.findIndex(
    (part) =>
      part.type === "tool-call" &&
      part.toolCallId === actionId &&
      part.artifact.kind === "hostCapability" &&
      isEmptyHostCapabilityAction(part.artifact),
  );
  if (index !== -1) parts.splice(index, 1);
}

function partReferencesElicitationAction(
  part: ChatHistoryMessagePart,
  actionId: string,
) {
  if (part.type === "data" && part.name === "elicitation") {
    return part.data.actionId === actionId;
  }
  return undefined;
}

function questionElicitationFromAction(
  action: ChatToolAction,
): ChatElicitation | undefined {
  const elicitation = chatElicitationFromAction(action);
  if (
    elicitation &&
    (elicitation.kind === "userInput" ||
      (elicitation.questions?.length ?? 0) > 0)
  ) {
    return {
      ...elicitation,
      phase: elicitationPhaseFromAction(
        action.phase,
        elicitation.phase,
        actionHasOutput(action),
      ),
    };
  }
  return undefined;
}

export function chatElicitationFromAction(
  action: ChatToolAction,
): ChatElicitation | undefined {
  if (!is.nonEmptyString(action.rawInput)) return undefined;
  try {
    const parsed: unknown = JSON.parse(action.rawInput);
    if (is.plainObject(parsed)) {
      const candidate = parsed as Partial<ChatElicitation>;
      if (is.string(candidate.id) && is.string(candidate.kind)) {
        return candidate as ChatElicitation;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function isPermissionElicitation(
  elicitation?: ChatElicitation,
): elicitation is ChatElicitation {
  return (
    elicitation?.kind === "approval" ||
    elicitation?.kind === "permissionProfile"
  );
}

export function isPlanApprovalElicitation(
  elicitation: ChatElicitation,
  parts: ChatHistoryMessagePart[],
) {
  const actionId = elicitation.actionId ?? elicitation.id;
  return parts.some(
    (part) =>
      part.type === "tool-call" &&
      part.artifact.id === actionId &&
      isPlanApprovalToolAction(part.artifact),
  );
}

export function isPlanApprovalToolAction(action: ChatToolAction) {
  return action.kind === "plan";
}

function elicitationPhaseFromAction(
  actionPhase: string | undefined,
  fallback: string,
  hasOutput: boolean,
) {
  if (hasOutput) return "resolved:Answers";
  if (actionPhase === undefined) return fallback;
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
  return (
    is.nonEmptyString(action.outputText) ||
    action.output?.some((output: ChatToolActionOutput) =>
      is.nonEmptyString(output.text),
    ) === true
  );
}

export function isClosedElicitationPhase(phase: string) {
  return phase === "cancelled" || phase.startsWith("resolved:");
}

function isEmptyHostCapabilityAction(action: ChatToolAction) {
  return (
    action.kind === "hostCapability" &&
    !action.error &&
    !is.nonEmptyString(action.outputText) &&
    action.output?.some((output: ChatToolActionOutput) =>
      is.nonEmptyString(output.text),
    ) !== true
  );
}

export function normalizeElicitationResponse(
  payload: unknown,
): ChatElicitationResponse | undefined {
  if (!is.plainObject(payload)) {
    return undefined;
  }
  const response = payload as {
    answers?: unknown;
    success?: unknown;
    type?: unknown;
    value?: unknown;
  };
  if (!is.string(response.type)) return undefined;

  switch (response.type) {
    case "allow":
    case "allowForSession":
    case "deny":
    case "cancel":
    case "externalComplete":
      return { type: response.type };
    case "answers":
      return Array.isArray(response.answers)
        ? {
            answers: response.answers
              .filter(
                (answer): answer is { id: string; value: string } =>
                  is.plainObject<{ id?: unknown; value?: unknown }>(answer) &&
                  is.string(answer.id) &&
                  is.string(answer.value),
              )
              .map((answer) => ({ id: answer.id, value: answer.value })),
            type: "answers",
          }
        : undefined;
    case "dynamicToolResult":
      return is.boolean(response.success)
        ? { success: response.success, type: "dynamicToolResult" }
        : undefined;
    case "raw":
      return is.string(response.value)
        ? { type: "raw", value: response.value }
        : undefined;
    default:
      return undefined;
  }
}
