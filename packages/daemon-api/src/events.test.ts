import type { DaemonGlobalEvent } from "./events";
import { isDaemonGlobalEvent } from "./events";
import { describe, expect, it } from "vitest";

const validEvents: DaemonGlobalEvent[] = [
  { chatIds: ["chat-1"], type: "chat-attention-changed" },
  { chatIds: ["chat-1"], type: "chat-metadata-changed" },
  {
    event: { part: "text", text: "hello", type: "delta" },
    streamId: "stream-1",
    type: "chat-stream",
  },
];

describe("isDaemonGlobalEvent", () => {
  it("accepts every global event variant", () => {
    for (const event of validEvents) {
      expect(isDaemonGlobalEvent(event), event.type).toBe(true);
    }
  });

  it.each([
    ["an unknown event", { type: "future-event" }],
    ["an empty chat id list", { chatIds: [], type: "chat-attention-changed" }],
    [
      "a malformed nested stream event",
      {
        event: { part: "analysis", text: "hello", type: "delta" },
        streamId: "stream-1",
        type: "chat-stream",
      },
    ],
  ])("rejects %s", (_label, event) => {
    expect(isDaemonGlobalEvent(event)).toBe(false);
  });
});
