import type { ChatPrewarmClaimInput } from "./engine-runtime";

import os from "node:os";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { Db } from "../../platform/db";
import { getOrCreateChatSession } from "./chat-session-factory";
import { chatPrewarmMatches, cwdForNewChat } from "./engine-runtime";

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

describe("chatPrewarmMatches", () => {
  // Every case below resolves to the standalone cwd, so no project lookup runs.
  const standalonePrewarm = { cwd: os.homedir(), input: {} };

  const matches = (
    prewarm: { cwd: string; input: ChatPrewarmClaimInput },
    claimInput: ChatPrewarmClaimInput,
  ) =>
    Effect.runPromise(
      chatPrewarmMatches(prewarm, claimInput).pipe(
        Effect.provide(dieDbLayer()),
      ),
    );

  it("claims a prewarm whose runtime and location agree", async () => {
    await expect(
      matches(
        { cwd: os.homedir(), input: { runtime: "codex" } },
        { creationLocation: "project", runtime: "codex" },
      ),
    ).resolves.toBe(true);
  });

  it("treats a missing creationLocation as project on both sides", async () => {
    await expect(matches(standalonePrewarm, {})).resolves.toBe(true);
  });

  it.each([
    ["an explicit cwd override", { cwd: "/tmp/somewhere-else" }],
    ["a different runtime", { runtime: "claude" }],
    ["a worktree chat", { creationLocation: "worktree" as const }],
  ])("refuses a prewarm with %s", async (_label, claimInput) => {
    await expect(matches(standalonePrewarm, claimInput)).resolves.toBe(false);
  });

  it("refuses a project prewarm claimed by a standalone chat", async () => {
    await expect(
      matches(
        { cwd: "/repos/angel-engine", input: { projectId: "project-1" } },
        {},
      ),
    ).resolves.toBe(false);
  });
});

describe("cwdForNewChat", () => {
  it("uses an explicit cwd before project/worktree resolution", async () => {
    // The explicit cwd short-circuits before any project lookup happens.
    const testDbLayer = dieDbLayer();

    await expect(
      Effect.runPromise(
        cwdForNewChat({ cwd: "/tmp/existing-worktree", text: "hi" }).pipe(
          Effect.provide(testDbLayer),
        ),
      ),
    ).resolves.toBe("/tmp/existing-worktree");
  });
});

function dieDbLayer() {
  return Layer.succeed(
    Db,
    new Db({ database: Effect.die("Database is not used in this test.") }),
  );
}
