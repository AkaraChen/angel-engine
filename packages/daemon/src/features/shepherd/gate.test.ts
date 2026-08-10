import type { ChatActivity } from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";

import { evaluateShepherdGate, isShepherdYieldOrigin } from "./gate";

function activity(status: ChatActivity["status"]): ChatActivity {
  if (status === "running") {
    return {
      chatId: "chat-1",
      runId: "run-1",
      status: "running",
      updatedAt: "2026-08-10T00:00:00.000Z",
    };
  }
  if (status === "waiting_for_you") {
    return {
      attentionId: "run-1:input:e1",
      chatId: "chat-1",
      reason: "approval",
      runId: "run-1",
      status: "waiting_for_you",
      updatedAt: "2026-08-10T00:00:00.000Z",
    };
  }
  if (status === "stuck") {
    return {
      chatId: "chat-1",
      reason: "process_exited",
      runId: "run-1",
      status: "stuck",
      updatedAt: "2026-08-10T00:00:00.000Z",
    };
  }
  if (status === "failed") {
    return {
      attentionId: "run-1:failed",
      chatId: "chat-1",
      failure: { message: "boom" },
      reason: "runtime_error",
      runId: "run-1",
      status: "failed",
      updatedAt: "2026-08-10T00:00:00.000Z",
    };
  }
  return {
    attentionId: "run-1:done",
    chatId: "chat-1",
    runId: "run-1",
    status: "done",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("evaluateShepherdGate", () => {
  it("sends when idle (no activity)", () => {
    expect(
      evaluateShepherdGate({
        activity: null,
        hasAmbiguousChatRun: false,
        hasQueuedChatRun: false,
      }),
    ).toEqual({ action: "send" });
  });

  it("sends when activity is done or failed", () => {
    expect(
      evaluateShepherdGate({
        activity: activity("done"),
        hasAmbiguousChatRun: false,
        hasQueuedChatRun: false,
      }),
    ).toEqual({ action: "send" });
    expect(
      evaluateShepherdGate({
        activity: activity("failed"),
        hasAmbiguousChatRun: false,
        hasQueuedChatRun: false,
      }),
    ).toEqual({ action: "send" });
  });

  it("queues when the chat is running", () => {
    expect(
      evaluateShepherdGate({
        activity: activity("running"),
        hasAmbiguousChatRun: false,
        hasQueuedChatRun: false,
      }),
    ).toEqual({ action: "queue" });
  });

  it("holds without queueing when waiting_for_you", () => {
    expect(
      evaluateShepherdGate({
        activity: activity("waiting_for_you"),
        hasAmbiguousChatRun: false,
        hasQueuedChatRun: false,
      }),
    ).toEqual({ action: "hold", reason: "waiting_for_you" });
  });

  it("holds without queueing when a queued chat run exists", () => {
    expect(
      evaluateShepherdGate({
        activity: null,
        hasAmbiguousChatRun: false,
        hasQueuedChatRun: true,
      }),
    ).toEqual({ action: "hold", reason: "queued_run" });
  });

  it("holds without queueing when an ambiguous run exists", () => {
    expect(
      evaluateShepherdGate({
        activity: null,
        hasAmbiguousChatRun: true,
        hasQueuedChatRun: false,
      }),
    ).toEqual({ action: "hold", reason: "ambiguous_run" });
  });

  it("prefers ambiguous hold over running queue", () => {
    expect(
      evaluateShepherdGate({
        activity: activity("running"),
        hasAmbiguousChatRun: true,
        hasQueuedChatRun: false,
      }),
    ).toEqual({ action: "hold", reason: "ambiguous_run" });
  });
});

describe("isShepherdYieldOrigin", () => {
  it("yields for user sends and keeps shepherd sends", () => {
    expect(isShepherdYieldOrigin(undefined)).toBe(true);
    expect(isShepherdYieldOrigin("shepherd")).toBe(false);
  });
});
