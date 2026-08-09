import { describe, expect, it } from "vitest";
import {
  billingBlockProgress,
  burnRateExceedsThreshold,
  formatDurationMinutes,
  formatEstimatedCost,
} from "./format";

describe("usage formatting", () => {
  it("keeps cents for estimated costs", () => {
    expect(formatEstimatedCost(17.724416)).toMatch(/17[.,]72/);
    expect(formatEstimatedCost(128.4212)).toMatch(/128[.,]42/);
  });

  it("formats remaining billing time without minute arithmetic", () => {
    expect(formatDurationMinutes(245)).toBe("4h05m");
    expect(formatDurationMinutes(45)).toBe("45m");
  });

  it("clamps billing-block progress to the active window", () => {
    const start = "2026-08-10T00:00:00.000Z";
    const end = "2026-08-10T05:00:00.000Z";
    expect(
      billingBlockProgress(start, end, Date.parse("2026-08-10T02:30:00.000Z")),
    ).toBe(0.5);
    expect(billingBlockProgress(start, end, Date.parse(end) + 1)).toBe(1);
  });

  it("only warns at the configured burn-rate threshold when enabled", () => {
    expect(burnRateExceedsThreshold(50, true, 50)).toBe(true);
    expect(burnRateExceedsThreshold(49.99, true, 50)).toBe(false);
    expect(burnRateExceedsThreshold(100, false, 50)).toBe(false);
  });
});
