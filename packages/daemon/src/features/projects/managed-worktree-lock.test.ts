import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { withManagedWorktreeLock } from "./managed-worktree-lock";

describe("withManagedWorktreeLock", () => {
  it("never interleaves two holders", async () => {
    const events: string[] = [];
    const section = (label: string) =>
      withManagedWorktreeLock(
        Effect.gen(function* () {
          events.push(`${label}:enter`);
          yield* Effect.sleep("10 millis");
          events.push(`${label}:exit`);
        }),
      );

    await Effect.runPromise(
      Effect.all([section("delete"), section("create")], {
        concurrency: "unbounded",
      }),
    );

    expect(events).toEqual([
      "delete:enter",
      "delete:exit",
      "create:enter",
      "create:exit",
    ]);
  });

  it("releases the permit when the holder fails", async () => {
    await Effect.runPromise(
      Effect.either(withManagedWorktreeLock(Effect.fail("boom"))),
    );

    await expect(
      Effect.runPromise(withManagedWorktreeLock(Effect.succeed("ok"))),
    ).resolves.toBe("ok");
  });
});
