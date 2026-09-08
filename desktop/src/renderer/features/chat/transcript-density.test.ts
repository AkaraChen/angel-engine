import { describe, expect, it } from "vitest";
import {
  defaultToolDetailsOpen,
  densityForTranscript,
} from "./transcript-density";

describe("densityForTranscript", () => {
  it("keeps the unified chat transcript compact", () => {
    expect(densityForTranscript()).toBe("compact");
  });
});

describe("defaultToolDetailsOpen", () => {
  it("keeps compact tool details collapsed", () => {
    expect(defaultToolDetailsOpen("compact", false)).toBe(false);
    expect(defaultToolDetailsOpen("compact", true)).toBe(false);
  });
});
