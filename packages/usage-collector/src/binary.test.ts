import { describe, expect, it } from "vitest";
import { ccusageNativePackage, resolveCcusageBinary } from "./binary.js";

describe("ccusage binary resolution", () => {
  it("uses an explicit platform package map", () => {
    expect(ccusageNativePackage("darwin", "arm64")).toBe(
      "@ccusage/ccusage-darwin-arm64",
    );
    expect(ccusageNativePackage("linux", "x64")).toBe(
      "@ccusage/ccusage-linux-x64",
    );
    expect(ccusageNativePackage("aix", "x64")).toBeUndefined();
  });

  it("resolves the installed executable without a package-runner fallback", async () => {
    await expect(resolveCcusageBinary()).resolves.toMatch(/ccusage(?:\.exe)?$/);
  });
});
