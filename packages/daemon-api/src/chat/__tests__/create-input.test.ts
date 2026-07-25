import type { ChatRunStartInput } from "..";
import { chatCreateInputSchema } from "..";
import { type as arkType } from "arktype";
import { describe, expect, it } from "vitest";

/**
 * Prewarm is a chat-creation optimization. Keeping it out of the run contract
 * is what stops stream semantics from creeping back into runs, so this fails to
 * compile the moment `ChatRunStartInput` grows a `prewarmId`.
 */
type RunStartHasNoPrewarm = "prewarmId" extends keyof ChatRunStartInput
  ? never
  : true;

describe("chat create input", () => {
  it("carries prewarmId so create can claim a prewarmed session", () => {
    const input = chatCreateInputSchema({
      prewarmId: "prewarm-1",
      projectId: "project-1",
      runtime: "claude",
    });

    expect(input).not.toBeInstanceOf(arkType.errors);
    expect(input).toMatchObject({ prewarmId: "prewarm-1" });
  });

  it("rejects an empty prewarmId instead of silently dropping it", () => {
    expect(chatCreateInputSchema({ prewarmId: "" })).toBeInstanceOf(
      arkType.errors,
    );
  });

  it("keeps prewarm off run start input", () => {
    const runStartHasNoPrewarm: RunStartHasNoPrewarm = true;

    expect(runStartHasNoPrewarm).toBe(true);
  });
});
