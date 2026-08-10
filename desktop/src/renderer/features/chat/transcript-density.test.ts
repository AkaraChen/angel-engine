import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRANSCRIPT_DENSITY_BY_MODE,
  defaultToolDetailsOpen,
  densityForWorkspaceMode,
  prefersReasoningOpen,
  sanitizeTranscriptDensity,
  sanitizeTranscriptDensityByMode,
} from "./transcript-density";

describe("defaultToolDetailsOpen", () => {
  it("keeps compact mode collapsed so tool spam stays out of the way", () => {
    expect(defaultToolDetailsOpen("compact", false)).toBe(false);
    expect(defaultToolDetailsOpen("compact", true)).toBe(false);
  });

  it("preserves normal auto-open when nothing follows the tool", () => {
    expect(defaultToolDetailsOpen("normal", false)).toBe(true);
    expect(defaultToolDetailsOpen("normal", true)).toBe(false);
  });

  it("opens debug detail by default for inspection", () => {
    expect(defaultToolDetailsOpen("debug", false)).toBe(true);
    expect(defaultToolDetailsOpen("debug", true)).toBe(true);
  });
});

describe("prefersReasoningOpen", () => {
  it("only force-opens reasoning in debug density", () => {
    expect(prefersReasoningOpen("compact")).toBe(false);
    expect(prefersReasoningOpen("normal")).toBe(false);
    expect(prefersReasoningOpen("debug")).toBe(true);
  });
});

describe("sanitizeTranscriptDensityByMode", () => {
  it("defaults chat to compact and project modes to normal", () => {
    expect(sanitizeTranscriptDensityByMode(undefined)).toEqual(
      DEFAULT_TRANSCRIPT_DENSITY_BY_MODE,
    );
    expect(DEFAULT_TRANSCRIPT_DENSITY_BY_MODE).toEqual({
      chat: "compact",
      power: "normal",
      work: "normal",
    });
  });

  it("keeps valid overrides and repairs invalid entries", () => {
    expect(
      sanitizeTranscriptDensityByMode({
        chat: "debug",
        power: "nope",
        work: "compact",
      }),
    ).toEqual({
      chat: "debug",
      power: "normal",
      work: "compact",
    });
  });
});

describe("densityForWorkspaceMode", () => {
  it("reads the mode-specific density", () => {
    const densities = sanitizeTranscriptDensityByMode({
      chat: "compact",
      power: "debug",
      work: "normal",
    });
    expect(densityForWorkspaceMode(densities, "chat")).toBe("compact");
    expect(densityForWorkspaceMode(densities, "power")).toBe("debug");
    expect(densityForWorkspaceMode(densities, "work")).toBe("normal");
  });
});

describe("sanitizeTranscriptDensity", () => {
  it("accepts only the three product densities", () => {
    expect(sanitizeTranscriptDensity("compact")).toBe("compact");
    expect(sanitizeTranscriptDensity("normal")).toBe("normal");
    expect(sanitizeTranscriptDensity("debug")).toBe("debug");
    expect(sanitizeTranscriptDensity("verbose")).toBeUndefined();
    expect(sanitizeTranscriptDensity(1)).toBeUndefined();
  });
});
