import { Effect, Layer } from "effect";
import type { Chat } from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";

import { Db } from "../../platform/db";
import { cwdForChat, cwdForNewChat } from "./chat-cwd";

function dieDbLayer() {
  return Layer.succeed(
    Db,
    new Db({ database: Effect.die("Database is not used in this test.") }),
  );
}

describe("cwdForNewChat handoff workspace reuse", () => {
  it("keeps an explicit source-session cwd for same/cross agent handoff", async () => {
    await expect(
      Effect.runPromise(
        cwdForNewChat({
          cwd: "/Users/dev/repo/.angel/worktrees/feat-auth",
          projectId: "proj-1",
        }).pipe(Effect.provide(dieDbLayer())),
      ),
    ).resolves.toBe("/Users/dev/repo/.angel/worktrees/feat-auth");
  });
  it("reports a missing historical cwd without falling back to home", async () => {
    const chat = {
      cwd: "/definitely-missing-old-worktree",
      projectId: null,
    } as Chat;
    await expect(
      Effect.runPromise(cwdForChat(chat).pipe(Effect.provide(dieDbLayer()))),
    ).rejects.toThrow("Chat cwd does not exist.");
  });
});
