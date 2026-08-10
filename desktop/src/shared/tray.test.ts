import { describe, expect, it } from "vitest";
import { sanitizeTrayEnabled, sanitizeTrayPreferences } from "./tray";

describe("sanitizeTrayPreferences", () => {
  it("defaults to enabled", () => {
    expect(sanitizeTrayPreferences(undefined)).toEqual({ enabled: true });
    expect(sanitizeTrayPreferences({})).toEqual({ enabled: true });
  });

  it("accepts an explicit off switch", () => {
    expect(sanitizeTrayPreferences({ enabled: false })).toEqual({
      enabled: false,
    });
    expect(sanitizeTrayEnabled("false")).toBe(false);
  });
});
