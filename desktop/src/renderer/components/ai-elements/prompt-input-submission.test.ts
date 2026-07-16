import { describe, expect, it } from "vitest";
import { shouldClearSubmittedInput } from "@/components/ai-elements/prompt-input-submission";

describe("prompt input submission cleanup", () => {
  it("preserves the draft when submission is rejected", () => {
    expect(shouldClearSubmittedInput(false)).toBe(false);
  });

  it.each([
    true,
    undefined,
  ])("clears the draft after an accepted submission (%s)", (result) => {
    expect(shouldClearSubmittedInput(result)).toBe(true);
  });
});
