import type { AppDatabase } from "../../platform/db";

import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { Db } from "../../platform/db";
import { getOrCreateChatSession } from "./chat-session-factory";
import { cwdForNewChat } from "./engine-runtime";

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

describe("cwdForNewChat", () => {
  it("uses an explicit cwd before project/worktree resolution", async () => {
    // The explicit cwd short-circuits before any project lookup happens.
    const testDbLayer = Layer.succeed(
      Db,
      new Db({ database: undefined as unknown as AppDatabase }),
    );

    await expect(
      Effect.runPromise(
        cwdForNewChat({ cwd: "/tmp/existing-worktree", text: "hi" }).pipe(
          Effect.provide(testDbLayer),
        ),
      ),
    ).resolves.toBe("/tmp/existing-worktree");
  });
});
