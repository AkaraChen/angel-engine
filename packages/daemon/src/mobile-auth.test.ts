import { describe, expect, it } from "vitest";
import { createMobileAuth, verifyMobilePassword } from "./mobile-auth";

describe("mobile auth", () => {
  it("accepts a non-empty password of any length", async () => {
    const auth = await createMobileAuth("x");

    await expect(verifyMobilePassword("x", auth)).resolves.toBe(true);
    await expect(verifyMobilePassword("", auth)).resolves.toBe(false);
  });
});
