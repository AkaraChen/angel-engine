import { describe, expect, it } from "vitest";

import {
  mergeUpdateProgress,
  normalizeUpdateProgress,
  shouldBroadcastUpdateProgress,
  UPDATE_PROGRESS_THROTTLE_MS,
} from "./update-progress";

describe("normalizeUpdateProgress", () => {
  it("keeps determinate progress when total is known", () => {
    expect(
      normalizeUpdateProgress({
        bytesPerSecond: 1_024,
        percent: 42.5,
        total: 10_000,
        transferred: 4_250,
      }),
    ).toEqual({
      bytesPerSecond: 1_024,
      percent: 42.5,
      total: 10_000,
      transferred: 4_250,
    });
  });

  it("drops percent and total when the server omits Content-Length", () => {
    expect(
      normalizeUpdateProgress({
        bytesPerSecond: 512,
        percent: Number.NaN,
        total: 0,
        transferred: 8_000,
      }),
    ).toEqual({
      bytesPerSecond: 512,
      transferred: 8_000,
    });
  });

  it("clamps percent into 0–100", () => {
    expect(
      normalizeUpdateProgress({
        bytesPerSecond: 1,
        percent: 140,
        total: 100,
        transferred: 100,
      }).percent,
    ).toBe(100);
  });
});

describe("mergeUpdateProgress", () => {
  it("never lets percent go backwards", () => {
    const previous = {
      bytesPerSecond: 100,
      percent: 60,
      total: 1_000,
      transferred: 600,
    };

    expect(
      mergeUpdateProgress(previous, {
        bytesPerSecond: 50,
        percent: 55,
        total: 1_000,
        transferred: 550,
      }),
    ).toEqual({
      bytesPerSecond: 50,
      percent: 60,
      total: 1_000,
      transferred: 600,
    });
  });

  it("preserves indeterminate shape when totals stay unknown", () => {
    expect(
      mergeUpdateProgress(
        { bytesPerSecond: 10, transferred: 100 },
        { bytesPerSecond: 20, transferred: 200 },
      ),
    ).toEqual({ bytesPerSecond: 20, transferred: 200 });
  });
});

describe("shouldBroadcastUpdateProgress", () => {
  it("always broadcasts the first sample and forced updates", () => {
    expect(
      shouldBroadcastUpdateProgress({
        lastBroadcastAt: undefined,
        now: 1_000,
      }),
    ).toBe(true);
    expect(
      shouldBroadcastUpdateProgress({
        force: true,
        lastBroadcastAt: 1_000,
        now: 1_001,
      }),
    ).toBe(true);
  });

  it("throttles high-frequency samples", () => {
    expect(
      shouldBroadcastUpdateProgress({
        lastBroadcastAt: 1_000,
        now: 1_000 + UPDATE_PROGRESS_THROTTLE_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldBroadcastUpdateProgress({
        lastBroadcastAt: 1_000,
        now: 1_000 + UPDATE_PROGRESS_THROTTLE_MS,
      }),
    ).toBe(true);
  });
});
