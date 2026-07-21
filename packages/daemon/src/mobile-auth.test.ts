import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createMobileAuth, verifyMobilePassword } from "./mobile-auth";

describe("mobile auth", () => {
  it("accepts a non-empty password of any length", async () => {
    const auth = await Effect.runPromise(createMobileAuth("x"));

    await expect(
      Effect.runPromise(verifyMobilePassword("x", auth)),
    ).resolves.toBe(true);
    await expect(
      Effect.runPromise(verifyMobilePassword("", auth)),
    ).resolves.toBe(false);
  });
});
