import type {
  ChatJsonObject,
  ChatToolAction,
  ChatToolActionPhase,
  ChatToolCallPart,
} from "../types.js";
import is from "@sindresorhus/is";

function toolActionToPart(action: ChatToolAction): ChatToolCallPart {
  const outputText = action.outputText
    ? action.outputText
    : action.error?.message;
  const argsText =
    action.rawInput !== null && action.rawInput !== undefined
      ? action.rawInput
      : action.inputSummary;
  if (!is.string(argsText)) {
    throw new Error("Tool action input summary is missing.");
  }
  return {
    args: parseToolArgs(action.rawInput),
    argsText,
    artifact: action,
    ...(action.error ? { isError: true } : {}),
    ...(outputText ? { result: outputText } : {}),
    toolCallId: action.id,
    toolName: action.kind,
    type: "tool-call",
  };
}

export const chatToolActionToPart = toolActionToPart;

export function isChatToolAction(value: unknown): value is ChatToolAction {
  return is.plainObject(value) && is.string(value.id);
}

function cloneChatToolAction(action: ChatToolAction): ChatToolAction {
  return {
    ...action,
    error: action.error ? { ...action.error } : action.error,
    output: action.output.map((item) => ({ ...item })),
  };
}

export function isTerminalChatToolPhase(phase?: ChatToolActionPhase): boolean {
  switch (phase) {
    case undefined:
    case "awaitingDecision":
    case "proposed":
    case "running":
    case "streamingResult":
      return false;
    case "cancelled":
    case "completed":
    case "declined":
    case "failed":
      return true;
  }

  const exhaustive: never = phase;
  return exhaustive;
}

function parseToolArgs(value?: string | null): ChatJsonObject {
  if (!is.string(value)) {
    throw new Error("Tool action raw input is missing.");
  }
  const parsed = JSON.parse(value);
  if (!is.plainObject(parsed)) {
    throw new Error("Tool action raw input must be a JSON object.");
  }
  return parsed as ChatJsonObject;
}
