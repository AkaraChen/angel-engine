import type { DaemonGlobalEvent } from "./events";
import { isDaemonGlobalEvent } from "./events";
import { describe, expect, it } from "vitest";

const validEvents: DaemonGlobalEvent[] = [
  { chatIds: ["chat-1"], type: "chat-activity-changed" },
  { chatIds: ["chat-1"], type: "chat-attention-changed" },
  { chatIds: ["chat-1"], type: "chat-conversation-changed" },
  { chatIds: ["chat-1"], type: "chat-metadata-changed" },
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
    ["a non-string chat id", { chatIds: [42], type: "chat-metadata-changed" }],
    [
      "a conversation event with no chat ids",
      { chatIds: [], type: "chat-conversation-changed" },
    ],
  ])("rejects %s", (_label, event) => {
    expect(isDaemonGlobalEvent(event)).toBe(false);
  });
});
