import is from "@sindresorhus/is";

import type {
  ChatAttention,
  ChatAttentionListResult,
  ChatAttentionReadInput,
  ChatAttentionReadResult,
} from "./index";

const ATTENTION_STATUSES = [
  "completed",
  "failed",
  "needsInput",
] as const satisfies readonly ChatAttention["status"][];

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

export function isChatAttention(value: unknown): value is ChatAttention {
  return (
    isBoundaryRecord(value) &&
    isNonEmptyString(value.chatId) &&
    isNonEmptyString(value.id) &&
    ATTENTION_STATUSES.some((status) => status === value.status) &&
    isCanonicalTimestamp(value.updatedAt)
  );
}

export function isChatAttentionListResult(
  value: unknown,
): value is ChatAttentionListResult {
  if (!isBoundaryRecord(value) || !Array.isArray(value.attentions)) {
    return false;
  }
  const chatIds = new Set<string>();
  for (const attention of value.attentions) {
    if (!isChatAttention(attention) || chatIds.has(attention.chatId)) {
      return false;
    }
    chatIds.add(attention.chatId);
  }
  return true;
}

export function isChatAttentionReadInput(
  value: unknown,
): value is ChatAttentionReadInput {
  return isBoundaryRecord(value) && isNonEmptyString(value.attentionId);
}

export function isChatAttentionReadResult(
  value: unknown,
): value is ChatAttentionReadResult {
  return isBoundaryRecord(value) && typeof value.read === "boolean";
}
