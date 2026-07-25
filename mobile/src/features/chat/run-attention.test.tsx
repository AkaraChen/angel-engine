import type {
  ChatActiveRunSnapshot,
  ChatStreamEvent,
} from "@/platform/chat-types";

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  applyChatRunAttentionEvent,
  applyChatRunAttentionSnapshot,
  setChatRunAttention,
  useChatRunAttention,
} from "./run-attention";

const resultEvent = {
  result: {
    chat: {
      archived: false,
      createdAt: "2026-07-25T00:00:00.000Z",
      cwd: "/tmp",
      id: "chat-attention",
      pinned: false,
      projectId: null,
      remoteThreadId: null,
      runtime: "codex",
      title: "Attention",
      updatedAt: "2026-07-25T00:00:01.000Z",
    },
    chatId: "chat-attention",
    content: [{ text: "done", type: "text" }],
    text: "done",
  },
  type: "result",
} satisfies ChatStreamEvent;

const staleSnapshot = {
  assistantMessage: {
    content: [],
    createdAt: "2026-07-25T00:00:00.000Z",
    id: "run-2:assistant",
    role: "assistant",
  },
  chatId: "chat-failed",
  lastEventSequence: 1,
  pendingElicitation: null,
  runId: "run-2",
  startedAt: "2026-07-25T00:00:00.000Z",
  status: "running",
  updatedAt: "2026-07-25T00:00:01.000Z",
  userMessage: {
    content: [{ text: "work", type: "text" }],
    createdAt: "2026-07-25T00:00:00.000Z",
    id: "run-2:user",
    role: "user",
  },
} satisfies ChatActiveRunSnapshot;

describe("chat run attention", () => {
  it("tracks needs-input and successful completion from one run", () => {
    const { result } = renderHook(() => useChatRunAttention("chat-attention"));
    expect(result.current).toBeNull();

    act(() =>
      applyChatRunAttentionEvent("chat-attention", "run-1", 1, {
        elicitation: {
          id: "elic-1",
          kind: "approval",
          phase: "open",
        },
        type: "elicitation",
      }),
    );
    expect(result.current).toBe("needsInput");

    act(() =>
      applyChatRunAttentionEvent("chat-attention", "run-1", 2, resultEvent),
    );
    expect(result.current).toBeNull();

    act(() =>
      applyChatRunAttentionEvent("chat-attention", "run-1", 3, {
        type: "done",
      }),
    );
    expect(result.current).toBe("completed");

    act(() => setChatRunAttention("chat-attention", "run-1", null));
    expect(result.current).toBeNull();
  });

  it("ignores stale clears and does not complete failed runs", () => {
    const { result } = renderHook(() => useChatRunAttention("chat-failed"));

    act(() =>
      applyChatRunAttentionEvent("chat-failed", "run-2", 2, {
        elicitation: {
          id: "elic-2",
          kind: "approval",
          phase: "open",
        },
        type: "elicitation",
      }),
    );
    act(() => applyChatRunAttentionSnapshot(staleSnapshot));
    act(() =>
      applyChatRunAttentionEvent("chat-failed", "run-2", 1, {
        part: "text",
        text: "stale",
        type: "delta",
      }),
    );
    act(() => setChatRunAttention("chat-failed", "run-old", null));
    expect(result.current).toBe("needsInput");

    act(() =>
      applyChatRunAttentionEvent("chat-failed", "run-2", 3, {
        message: "failed",
        type: "error",
      }),
    );
    act(() =>
      applyChatRunAttentionEvent("chat-failed", "run-2", 4, { type: "done" }),
    );
    expect(result.current).toBeNull();
  });
});
