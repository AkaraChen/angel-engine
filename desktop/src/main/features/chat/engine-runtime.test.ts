import { describe, expect, it } from "vitest";

import { getOrCreateChatSession } from "./engine-runtime";

describe("chat session creation", () => {
  it("dedupes concurrent creation for one chat", async () => {
    const sessions = new Map<string, { id: string }>();
    const creations = new Map<string, Promise<{ id: string }>>();
    let createCount = 0;

    const first = getOrCreateChatSession(
      "chat-1",
      sessions,
      creations,
      async () => {
        createCount += 1;
        await Promise.resolve();
        return { id: "session-1" };
      },
    );
    const second = getOrCreateChatSession(
      "chat-1",
      sessions,
      creations,
      async () => {
        createCount += 1;
        return { id: "session-2" };
      },
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: "session-1" },
      { id: "session-1" },
    ]);
    expect(createCount).toBe(1);
    expect(sessions.get("chat-1")).toEqual({ id: "session-1" });
    expect(creations.has("chat-1")).toBe(false);
  });
});
