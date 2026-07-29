import { describe, expect, it } from "vitest";

import {
  BACKGROUND_CHECK_INTERVAL_MS,
  shouldRunBackgroundCheck,
} from "./updater-schedule";

const baseInput = {
  lastCheckStartedAt: undefined,
  now: 1_000_000,
  packaged: true,
  state: "idle",
  supported: true,
} satisfies Parameters<typeof shouldRunBackgroundCheck>[0];

describe("shouldRunBackgroundCheck", () => {
  it("runs the first check on a packaged, supported build", () => {
    expect(shouldRunBackgroundCheck(baseInput)).toBe(true);
  });

  it("skips unsupported platforms", () => {
    expect(shouldRunBackgroundCheck({ ...baseInput, supported: false })).toBe(
      false,
    );
  });

  it("skips unpackaged builds", () => {
    expect(shouldRunBackgroundCheck({ ...baseInput, packaged: false })).toBe(
      false,
    );
  });

  it.each([
    "checking",
    "downloading",
    "downloaded",
  ] as const)("skips while %s", (state) => {
    expect(shouldRunBackgroundCheck({ ...baseInput, state })).toBe(false);
  });

  it("retries after a failed check", () => {
    expect(shouldRunBackgroundCheck({ ...baseInput, state: "error" })).toBe(
      true,
    );
  });

  it("throttles repeated focus events", () => {
    expect(
      shouldRunBackgroundCheck({
        ...baseInput,
        lastCheckStartedAt: baseInput.now - 1000,
      }),
    ).toBe(false);
  });

  it("checks again once the interval has elapsed", () => {
    expect(
      shouldRunBackgroundCheck({
        ...baseInput,
        lastCheckStartedAt: baseInput.now - BACKGROUND_CHECK_INTERVAL_MS,
      }),
    ).toBe(true);
  });
});
