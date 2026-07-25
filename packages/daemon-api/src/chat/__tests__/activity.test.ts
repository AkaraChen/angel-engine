import type { ChatActivity } from "..";
import { isChatActivity, isChatActivityListResult } from "..";
import { describe, expect, it } from "vitest";

const running: ChatActivity = {
  chatId: "chat-1",
  runId: "run-1",
  status: "running",
  updatedAt: "2026-07-25T01:00:00.000Z",
};

describe("chat activity boundary guards", () => {
  it.each<ChatActivity>([
    running,
    {
      ...running,
      attentionId: "run-1:input:elicitation-1",
      reason: "approval",
      status: "waiting_for_you",
    },
    { ...running, reason: "process_exited", status: "stuck" },
    { ...running, attentionId: "run-1:done", status: "done" },
    {
      ...running,
      attentionId: "run-1:failed",
      failure: { message: "Runtime failed." },
      reason: "runtime_error",
      status: "failed",
    },
  ])("accepts $status activity", (activity) => {
    expect(isChatActivity(activity)).toBe(true);
    expect(isChatActivityListResult({ items: [activity] })).toBe(true);
  });

  it.each([
    ["an unknown status", { ...running, status: "future-status" }],
    ["an empty run id", { ...running, runId: "" }],
    ["attention on running", { ...running, attentionId: "unexpected" }],
    [
      "waiting without a marker",
      { ...running, reason: "question", status: "waiting_for_you" },
    ],
    [
      "failed without a concise message",
      {
        ...running,
        attentionId: "run-1:failed",
        failure: { message: "" },
        reason: "runtime_error",
        status: "failed",
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isChatActivity(value)).toBe(false);
  });

  it("rejects duplicate activity entries for one chat", () => {
    expect(
      isChatActivityListResult({
        items: [running, { ...running, runId: "run-2" }],
      }),
    ).toBe(false);
  });
});
