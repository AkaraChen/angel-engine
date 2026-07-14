import type {
  ConversationMessage,
  ConversationToolCall,
  DaemonHistoryMessage,
  DaemonMessagePart,
  DaemonToolAction,
} from "@/platform/chat-types";

/**
 * Derives the mobile conversation view model from the daemon's history shape.
 *
 * The daemon message is a list of typed parts (text, reasoning, tool calls,
 * plans, …). This flattens the `text` and `reasoning` parts into strings,
 * projects `tool-call` parts into {@link ConversationToolCall}s so they render
 * inline, and drops the rest. Keeping the projection pure (no React, no client)
 * makes the streaming reducer and the page trivial to test.
 */

/** Concatenate the text of every part with the given `type`. */
export function partsToText(
  parts: DaemonMessagePart[],
  type: "reasoning" | "text",
): string {
  return parts
    .filter((part) => part.type === type && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/** Phases the daemon reports while a tool call is still in flight. */
const RUNNING_TOOL_PHASES = new Set([
  "proposed",
  "awaitingDecision",
  "running",
  "streamingResult",
]);

export function isRunningToolPhase(phase: string): boolean {
  return RUNNING_TOOL_PHASES.has(phase);
}

export function isFailedToolPhase(phase: string): boolean {
  return phase === "failed" || phase === "declined";
}

function coerceText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

/** Longest non-empty of the candidates, falling back to `fallback`. */
function firstNonEmpty(candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return "";
}

/**
 * Project a `tool-call` history part into a rendered tool call. Returns `null`
 * for a degenerate part with no identifying name/artifact so a bare
 * `{ type: "tool-call" }` doesn't render an empty card.
 */
export function toolCallFromPart(
  part: DaemonMessagePart,
): ConversationToolCall | null {
  const action = part.artifact;
  const name = firstNonEmpty([
    action?.title,
    action?.inputSummary,
    part.toolName,
  ]);
  const phase =
    action?.phase ??
    (part.isError === true ? "failed" : name.length > 0 ? "completed" : "");
  if (name.length === 0 && phase.length === 0) return null;

  const errorText = firstNonEmpty([action?.error?.message]);
  const outputText = firstNonEmpty([
    action?.outputText,
    coerceText(part.result),
  ]);
  return {
    id: firstNonEmpty([part.toolCallId, action?.id]) || name,
    name: name.length > 0 ? name : "Tool call",
    phase: phase.length > 0 ? phase : "completed",
    argsText: firstNonEmpty([part.argsText, action?.rawInput]),
    outputText,
    errorText,
    isError:
      part.isError === true || isFailedToolPhase(phase) || errorText.length > 0,
  };
}

/**
 * Project a streamed tool action (`tool`/`toolDelta` event) into a rendered tool
 * call, mirroring {@link toolCallFromPart} for the live turn.
 */
export function toolCallFromAction(
  action: DaemonToolAction,
): ConversationToolCall | null {
  const name = firstNonEmpty([action.title, action.inputSummary, action.kind]);
  const phase = action.phase ?? "";
  if (name.length === 0 && phase.length === 0) return null;
  const errorText = firstNonEmpty([action.error?.message]);
  return {
    id: action.id ?? name,
    name: name.length > 0 ? name : "Tool call",
    phase: phase.length > 0 ? phase : "running",
    argsText: firstNonEmpty([action.rawInput, action.inputSummary]),
    outputText: firstNonEmpty([action.outputText]),
    errorText,
    isError: isFailedToolPhase(phase) || errorText.length > 0,
  };
}

/** Project every `tool-call` part of a message into rendered tool calls. */
export function partsToToolCalls(
  parts: DaemonMessagePart[],
): ConversationToolCall[] {
  const calls: ConversationToolCall[] = [];
  for (const part of parts) {
    if (part.type !== "tool-call") continue;
    const call = toolCallFromPart(part);
    if (call !== null) calls.push(call);
  }
  return calls;
}

/** Project a single daemon history message into a rendered conversation row. */
export function toConversationMessage(
  message: DaemonHistoryMessage,
): ConversationMessage {
  return {
    id: message.id,
    role: message.role,
    text: partsToText(message.content, "text"),
    reasoning: partsToText(message.content, "reasoning"),
    status: "complete",
    toolCalls: partsToToolCalls(message.content),
  };
}

/**
 * Project the daemon history into conversation rows, dropping `system` messages
 * (agent bootstrap prompts) and any assistant turn that produced no visible
 * content at all (no prose, reasoning, or tool calls) so the mobile transcript
 * stays readable while still surfacing pure tool-call turns.
 */
export function toConversation(
  messages: DaemonHistoryMessage[],
): ConversationMessage[] {
  return messages
    .filter((message) => message.role !== "system")
    .map(toConversationMessage)
    .filter(
      (message) =>
        message.role === "user" ||
        message.text.length > 0 ||
        message.reasoning.length > 0 ||
        message.toolCalls.length > 0,
    );
}
