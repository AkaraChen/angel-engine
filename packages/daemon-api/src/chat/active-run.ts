import is from "@sindresorhus/is";

import type {
  ChatActiveRunResult,
  ChatActiveRunSnapshot,
  ChatHistoryMessage,
  ChatRunObserverEvent,
} from "./index";
import {
  isChatElicitation,
  isChatHistoryMessage,
  isChatStreamEvent,
} from "./stream-event";

type BoundaryRecord = Record<string, unknown>;

function isBoundaryRecord(value: unknown): value is BoundaryRecord {
  return is.plainObject(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}

function isEventSequence(value: unknown, allowZero: boolean): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= (allowZero ? 0 : 1)
  );
}

function isRunMessage(
  value: unknown,
  role: "assistant" | "user",
): value is ChatHistoryMessage {
  return (
    isChatHistoryMessage(value) &&
    value.role === role &&
    isNonEmptyString(value.id)
  );
}

/**
 * Validate an active-run snapshot returned by the daemon.
 *
 * A run either proceeds without pending input or carries exactly one pending
 * elicitation. The discriminated union deliberately rejects mixed states.
 */
export function isChatActiveRunSnapshot(
  value: unknown,
): value is ChatActiveRunSnapshot {
  if (!isBoundaryRecord(value)) return false;
  if (
    !isRunMessage(value.assistantMessage, "assistant") ||
    !isNonEmptyString(value.chatId) ||
    !isEventSequence(value.lastEventSequence, true) ||
    !isNonEmptyString(value.runId) ||
    !isCanonicalTimestamp(value.startedAt) ||
    !isCanonicalTimestamp(value.updatedAt) ||
    !isRunMessage(value.userMessage, "user")
  ) {
    return false;
  }
  if (value.updatedAt < value.startedAt) return false;

  switch (value.status) {
    case "running":
      return value.pendingElicitation === null;
    case "needsInput":
      return (
        isChatElicitation(value.pendingElicitation) &&
        isNonEmptyString(value.pendingElicitation.id) &&
        value.pendingElicitation.phase === "open"
      );
    default:
      return false;
  }
}

export function isChatActiveRunResult(
  value: unknown,
): value is ChatActiveRunResult {
  return (
    isBoundaryRecord(value) &&
    (value.run === null || isChatActiveRunSnapshot(value.run))
  );
}

/**
 * Validate one JSON-decoded message from an active-run observer stream.
 *
 * Attachment always starts with a materialized snapshot. Later messages carry
 * the existing closed `ChatStreamEvent` union plus a monotonic sequence.
 */
export function isChatRunObserverEvent(
  value: unknown,
): value is ChatRunObserverEvent {
  if (!isBoundaryRecord(value)) return false;
  switch (value.type) {
    case "snapshot":
      return isChatActiveRunSnapshot(value.snapshot);
    case "event":
      return (
        isEventSequence(value.sequence, false) && isChatStreamEvent(value.event)
      );
    default:
      return false;
  }
}
