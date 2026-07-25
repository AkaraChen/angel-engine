import { describe, expect, it } from "vitest";
import { isDaemonGlobalEvent } from "./events";

describe("isDaemonGlobalEvent", () => {
  it("accepts sequenced chat-run events", () => {
    expect(
      isDaemonGlobalEvent({
        chatId: "chat-1",
        event: { part: "text", text: "hi", type: "delta" },
        runId: "run-1",
        sequence: 1,
        type: "chat-run",
      }),
    ).toBe(true);
  });

  it.each([
    {
      chatId: "",
      event: { type: "done" },
      runId: "run-1",
      sequence: 1,
      type: "chat-run",
    },
    {
      chatId: "chat-1",
      event: { type: "future" },
      runId: "run-1",
      sequence: 1,
      type: "chat-run",
    },
    {
      chatId: "chat-1",
      event: { type: "done" },
      runId: "run-1",
      sequence: 1.5,
      type: "chat-run",
    },
  ])("rejects malformed global events", (event) => {
    expect(isDaemonGlobalEvent(event)).toBe(false);
  });
});
