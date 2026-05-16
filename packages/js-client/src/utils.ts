import type {
  ChatJsonObject,
  ChatJsonValue,
  ChatHistoryMessagePart,
  ChatToolAction,
  ChatToolCallPart,
} from "./types";

export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function appendTextPart(
  parts: ChatHistoryMessagePart[],
  type: "reasoning" | "text",
  text: string,
): void {
  if (!text) return;
  const last = parts.at(-1);
  if (last?.type === type) {
    last.text += text;
    return;
  }
  parts.push({ text, type });
}

export function toolActionToPart(action: ChatToolAction): ChatToolCallPart {
  const outputText = action.outputText || action.error?.message;
  return {
    args: parseJsonObject(action.rawInput) ?? {},
    argsText: action.rawInput || action.inputSummary || "",
    artifact: action,
    ...(action.error ? { isError: true } : {}),
    ...(outputText ? { result: outputText } : {}),
    toolCallId: action.id,
    toolName: action.kind || "tool",
    type: "tool-call",
  };
}

function parseJsonObject(value?: string | null): ChatJsonObject | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isJsonObject(value: unknown): value is ChatJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is ChatJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}
