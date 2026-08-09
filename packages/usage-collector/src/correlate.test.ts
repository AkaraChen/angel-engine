import { describe, expect, it } from "vitest";
import { normalizedSessionId, providerUsageAvailability } from "./correlate.js";
import { CCUSAGE_VERSION, type UsageAvailability } from "./types.js";

describe("usage session attribution", () => {
  it("normalizes only spike-verified provider identifiers", () => {
    const id = "019fe6d4-0ec1-7992-9154-d2e714959d54";
    expect(normalizedSessionId("claude", id)).toBe(id);
    expect(normalizedSessionId("kimi", id)).toBe(id);
    expect(
      normalizedSessionId(
        "codex",
        `2026/08/09/rollout-2026-08-09T22-01-24-${id}`,
      ),
    ).toBe(id);
    expect(normalizedSessionId("gemini", id)).toBeUndefined();
    expect(normalizedSessionId("copilot", id)).toBeUndefined();
    expect(normalizedSessionId("pi", id)).toBeUndefined();
  });

  it("keeps supported/no-data and unsupported states distinct", () => {
    const availability: UsageAvailability = {
      collectedAt: 1,
      kind: "ok",
      report: {
        agentTotals: [],
        ccusageVersion: CCUSAGE_VERSION,
        collectedAt: 1,
        periods: {
          month: { costUsd: 0, tokens: 0 },
          today: { costUsd: 0, tokens: 0 },
          week: { costUsd: 0, tokens: 0 },
        },
        sessions: [],
      },
    };
    expect(providerUsageAvailability(availability, "gemini")).toEqual({
      agent: "gemini",
      kind: "no-data",
    });
    expect(providerUsageAvailability(availability, "cursor")).toEqual({
      agent: "cursor",
      kind: "unsupported",
    });
  });
});
