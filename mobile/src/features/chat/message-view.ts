import type {
  ConversationMessage,
  ConversationToolCall,
  DaemonHistoryMessage,
  DaemonMessagePart,
  DaemonPlanData,
  DaemonToolCallPart,
  DaemonToolAction,
  ProjectedConversationToolCall,
} from "@/platform/chat-types";
import { chatToolActionToPart } from "@angel-engine/daemon-api/chat";

import {
  cloneChatPlanData,
  isChatPlanPart,
  normalizeChatPlanMessages,
  normalizeConversationPlans,
} from "./plan-utils";

/**
 * Derives the mobile conversation view model from the daemon's history shape.
 *
 * The daemon message is a list of typed parts (text, reasoning, tool calls,
 * plans, …). This flattens the `text` and `reasoning` parts into strings,
 * projects `tool-call` parts into {@link ConversationToolCall}s and plan data
 * parts into {@link DaemonPlanData} so they render inline, and drops the rest.
 * Keeping the projection pure (no React, no client) makes the streaming reducer
 * and the page trivial to test.
 */

/** Concatenate the text of every part with the given `type`. */
export function partsToText(
  parts: DaemonMessagePart[],
  type: "reasoning" | "text",
): string {
  return parts
    .flatMap((part) => (part.type === type ? [part.text] : []))
    .join("");
}

/** Phases the daemon reports while a tool call is still in flight. */
const RUNNING_TOOL_PHASES: ReadonlySet<ConversationToolCall["phase"]> = new Set(
  ["proposed", "awaitingDecision", "running", "streamingResult"],
);

export function isRunningToolPhase(
  phase: ConversationToolCall["phase"],
): boolean {
  return RUNNING_TOOL_PHASES.has(phase);
}

export function isFailedToolPhase(
  phase: ConversationToolCall["phase"],
): boolean {
  return phase === "failed" || phase === "declined";
}

/** Human-friendly label for a daemon tool lifecycle phase. */
export function formatToolPhase(phase: ConversationToolCall["phase"]): string {
  switch (phase) {
    case "proposed":
      return "Proposed";
    case "awaitingDecision":
      return "Awaiting approval";
    case "running":
      return "Running";
    case "streamingResult":
      return "Streaming";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
  }
  const exhaustive: never = phase;
  return exhaustive;
}

/**
 * The summary shown on a collapsed tool-call group (the mobile counterpart to
 * the desktop `ToolGroup` label): a single call reads as `name · phase`, while
 * several collapse to a plain count. Pure so it stays trivially testable.
 */
export function toolGroupLabel(calls: ConversationToolCall[]): string {
  if (calls.length === 1) {
    const [call] = calls;
    return `${call.name} · ${formatToolPhase(call.phase)}`;
  }
  return `${calls.length} tool calls`;
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

/** Project a canonical `tool-call` history part into a rendered tool call. */
export function toolCallFromPart(
  part: DaemonToolCallPart,
): ProjectedConversationToolCall {
  const action = part.artifact;
  // The tool identifier (`command`, `Read`, `mcp__x__y`) is the primary label;
  // the human title/summary is secondary. Keeping them distinct is what surfaces
  // *which* tool ran rather than only a paraphrase (KIT-146 acceptance).
  const identifier = firstNonEmpty([part.toolName, action.kind]);
  const summary = firstNonEmpty([action.title, action.inputSummary]);
  const phase = action.phase;

  const errorText = firstNonEmpty([action.error?.message]);
  const outputText = firstNonEmpty([
    action.outputText,
    coerceText(part.result),
  ]);
  const label = resolveToolLabel(identifier, summary);
  return {
    id: firstNonEmpty([part.toolCallId, action.id]) || label.name,
    name: label.name,
    summary: label.summary,
    phase,
    argsText: firstNonEmpty([part.argsText, action.rawInput]),
    outputText,
    errorText,
    isError:
      part.isError === true || isFailedToolPhase(phase) || errorText.length > 0,
    historyPart: part,
  };
}

/**
 * Project a streamed tool action (`tool`/`toolDelta` event) into a rendered tool
 * call, mirroring {@link toolCallFromPart} for the live turn. Mid-stream the
 * snapshot exposes `kind` (the tool category) as the identifier; the persisted
 * part carries the precise `toolName` once history refetches.
 */
export function toolCallFromAction(
  action: DaemonToolAction,
): ProjectedConversationToolCall {
  return toolCallFromPart(chatToolActionToPart(action));
}

/**
 * Decide the primary name and secondary summary. Prefer the tool identifier as
 * the name; if none exists, promote the summary so the card is never nameless,
 * and drop the now-redundant secondary line. Also collapse the secondary line
 * when it merely repeats the identifier.
 */
function resolveToolLabel(
  identifier: string,
  summary: string,
): { name: string; summary: string } {
  if (identifier.length === 0) {
    return { name: summary.length > 0 ? summary : "Tool call", summary: "" };
  }
  return {
    name: identifier,
    summary: summary === identifier ? "" : summary,
  };
}

/** Project every `tool-call` part of a message into rendered tool calls. */
export function partsToToolCalls(
  parts: DaemonMessagePart[],
): ProjectedConversationToolCall[] {
  const calls: ProjectedConversationToolCall[] = [];
  for (const part of parts) {
    if (part.type !== "tool-call") continue;
    calls.push(toolCallFromPart(part));
  }
  return calls;
}

/** Project every plan/todo data part of a message into plan snapshots. */
export function partsToPlans(parts: DaemonMessagePart[]): DaemonPlanData[] {
  const plans: DaemonPlanData[] = [];
  for (const part of parts) {
    if (!isChatPlanPart(part)) continue;
    plans.push(cloneChatPlanData(part.data));
  }
  return plans;
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
    plans: partsToPlans(message.content),
  };
}

/**
 * Project the daemon history into conversation rows, dropping `system` messages
 * (agent bootstrap prompts) and any assistant turn that produced no visible
 * content at all (no prose, reasoning, tool calls, or plans) so the mobile
 * transcript stays readable while still surfacing pure tool-call / plan turns.
 */
export function toConversation(
  messages: DaemonHistoryMessage[],
): ConversationMessage[] {
  const normalized = normalizeChatPlanMessages(messages);
  return normalizeConversationPlans(
    normalized
      .filter((message) => message.role !== "system")
      .map(toConversationMessage)
      .filter(
        (message) =>
          message.role === "user" ||
          message.text.length > 0 ||
          message.reasoning.length > 0 ||
          message.toolCalls.length > 0 ||
          message.plans.length > 0,
      ),
  );
}
