import is from "@sindresorhus/is";

import type { ChatActivity, ChatActivityListResult } from "./index";

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

export function isChatActivity(value: unknown): value is ChatActivity {
  if (
    !isBoundaryRecord(value) ||
    !isNonEmptyString(value.chatId) ||
    !isNonEmptyString(value.runId) ||
    !isCanonicalTimestamp(value.updatedAt)
  ) {
    return false;
  }

  switch (value.status) {
    case "running":
      return (
        value.attentionId === undefined &&
        value.failure === undefined &&
        value.reason === undefined
      );
    case "waiting_for_you":
      return (
        isNonEmptyString(value.attentionId) &&
        (value.reason === "approval" || value.reason === "question") &&
        value.failure === undefined
      );
    case "stuck":
      return (
        value.attentionId === undefined &&
        value.failure === undefined &&
        value.reason === "process_exited"
      );
    case "done":
      return (
        isNonEmptyString(value.attentionId) &&
        value.failure === undefined &&
        value.reason === undefined
      );
    case "failed":
      return (
        isNonEmptyString(value.attentionId) &&
        value.reason === "runtime_error" &&
        isBoundaryRecord(value.failure) &&
        isNonEmptyString(value.failure.message)
      );
    default:
      return false;
  }
}

export function isChatActivityListResult(
  value: unknown,
): value is ChatActivityListResult {
  if (!isBoundaryRecord(value) || !Array.isArray(value.items)) return false;

  const chatIds = new Set<string>();
  for (const activity of value.items) {
    if (!isChatActivity(activity) || chatIds.has(activity.chatId)) return false;
    chatIds.add(activity.chatId);
  }
  return true;
}
