import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { Db } from "../../platform/db";
import { cwdForNewChat } from "./chat-cwd";

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

  it("still refuses a worktree chat without a project", async () => {
    await expect(
      Effect.runPromise(
        cwdForNewChat({ creationLocation: "worktree" }).pipe(
          Effect.provide(dieDbLayer()),
        ),
      ),
    ).rejects.toThrow(/project/i);
  });
});
