import type {
  ChatActiveRunSnapshot,
  ChatStreamEvent,
} from "@/platform/chat-types";

import { useSyncExternalStore } from "react";

export type ChatRunAttention = "completed" | "needsInput";

interface AttentionEntry {
  runId: string;
  status: ChatRunAttention;
}

interface RunProgress {
  runId: string;
  sequence: number;
  successful: boolean;
}

const entries = new Map<string, AttentionEntry>();
const listeners = new Set<() => void>();
const progress = new Map<string, RunProgress>();

export function setChatRunAttention(
  chatId: string,
  runId: string,
  status: ChatRunAttention | null,
): void {
  const current = entries.get(chatId);
  if (status === null) {
    if (runId === "") progress.delete(chatId);
    if (current === undefined || (runId !== "" && current.runId !== runId)) {
      return;
    }
  }
  replaceAttention(chatId, runId, status);
}

export function applyChatRunAttentionSnapshot(
  snapshot: ChatActiveRunSnapshot,
): void {
  const next = advanceRun(
    snapshot.chatId,
    snapshot.runId,
    snapshot.lastEventSequence,
  );
  if (next === null) return;
  replaceAttention(
    snapshot.chatId,
    snapshot.runId,
    snapshot.status === "needsInput" ? "needsInput" : null,
  );
}

function replaceAttention(
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
  sequence: number,
  event: ChatStreamEvent,
): void {
  const next = advanceRun(chatId, runId, sequence);
  if (next === null) return;
  if (event.type === "result") {
    next.successful = true;
    replaceAttention(chatId, runId, null);
    return;
  }
  if (event.type === "error") {
    next.successful = false;
    replaceAttention(chatId, runId, null);
    return;
  }
  if (event.type === "done") {
    replaceAttention(chatId, runId, next.successful ? "completed" : null);
    return;
  }
  if (event.type === "elicitation" && event.elicitation.phase === "open") {
    replaceAttention(chatId, runId, "needsInput");
    return;
  }
  replaceAttention(chatId, runId, null);
}

function advanceRun(
  chatId: string,
  runId: string,
  sequence: number,
): RunProgress | null {
  const current = progress.get(chatId);
  if (current?.runId === runId && current.sequence >= sequence) return null;
  const next: RunProgress = {
    runId,
    sequence,
    successful: current?.runId === runId && current.successful,
  };
  progress.set(chatId, next);
  return next;
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
