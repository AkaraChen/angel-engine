import type { ChatStreamEvent } from "@/platform/chat-types";

import { useSyncExternalStore } from "react";

export type ChatRunAttention = "completed" | "needsInput";

interface AttentionEntry {
  runId: string;
  status: ChatRunAttention;
}

const entries = new Map<string, AttentionEntry>();
const listeners = new Set<() => void>();

export function setChatRunAttention(
  chatId: string,
  runId: string,
  status: ChatRunAttention | null,
): void {
  const current = entries.get(chatId);
  if (status === null) {
    if (current === undefined) return;
    entries.delete(chatId);
  } else {
    if (current?.runId === runId && current.status === status) return;
    entries.set(chatId, { runId, status });
  }
  for (const listener of listeners) listener();
}

export function applyChatRunAttentionEvent(
  chatId: string,
  runId: string,
  event: ChatStreamEvent,
): void {
  if (event.type === "done") {
    setChatRunAttention(chatId, runId, "completed");
    return;
  }
  if (event.type === "elicitation" && event.elicitation.phase === "open") {
    setChatRunAttention(chatId, runId, "needsInput");
    return;
  }
  setChatRunAttention(chatId, runId, null);
}

export function useChatRunAttention(chatId: string): ChatRunAttention | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entries.get(chatId)?.status ?? null,
    () => null,
  );
}
