import { describe, expect, it } from "vitest";
import { compileBlockedHostPatterns, isHostBlocked } from "./host-guard";

describe("host guard", () => {
  it("allows every host when no patterns are configured", () => {
    expect(isHostBlocked("evil.com", compileBlockedHostPatterns([]))).toBe(
      false,
    );
  });

  it("matches hosts case-insensitively by lower-casing the header", () => {
    const patterns = compileBlockedHostPatterns(["^evil\\.com$"]);

    expect(isHostBlocked("EVIL.com", patterns)).toBe(true);
  });

  it("keeps the port as part of the value being matched", () => {
    expect(
      isHostBlocked(
        "evil.com:1234",
        compileBlockedHostPatterns(["^evil\\.com$"]),
      ),
    ).toBe(false);
    expect(
      isHostBlocked(
        "evil.com:1234",
        compileBlockedHostPatterns(["^evil\\.com(:\\d+)?$"]),
      ),
    ).toBe(true);
  });

  it("matches a missing Host header as an empty string", () => {
    expect(
      isHostBlocked(undefined, compileBlockedHostPatterns(["^evil\\.com$"])),
    ).toBe(false);
    expect(isHostBlocked(undefined, compileBlockedHostPatterns(["^$"]))).toBe(
      true,
    );
  });

  it("blocks when any configured pattern matches", () => {
    const patterns = compileBlockedHostPatterns([
      "^first\\.example$",
      "^second\\.example$",
    ]);

    expect(isHostBlocked("second.example", patterns)).toBe(true);
    expect(isHostBlocked("third.example", patterns)).toBe(false);
  });

  it("rejects invalid regular expressions during compilation", () => {
    expect(() => compileBlockedHostPatterns(["("])).toThrow(SyntaxError);
  });
});
