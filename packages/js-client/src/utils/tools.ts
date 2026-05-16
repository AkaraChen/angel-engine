import { type } from "arktype";
import type {
  ChatJsonObject,
  ChatToolAction,
  ChatToolActionPhase,
  ChatToolCallPart,
} from "../types.js";

const chatToolAction = type({
  "[string]": "unknown",
  id: "string",
});

function toolActionToPart(action: ChatToolAction): ChatToolCallPart {
  const outputText = action.outputText || action.error?.message;
  return {
    args: parseToolArgs(action.rawInput),
    argsText: action.rawInput || action.inputSummary || "",
    artifact: action,
    ...(action.error ? { isError: true } : {}),
    ...(outputText ? { result: outputText } : {}),
    toolCallId: action.id,
    toolName: action.kind || "tool",
    type: "tool-call",
  };
}

export const chatToolActionToPart = toolActionToPart;

export function isChatToolAction(value: unknown): value is ChatToolAction {
  return !(chatToolAction(value) instanceof type.errors);
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
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ChatJsonObject;
  } catch {
    return {};
  }
}
