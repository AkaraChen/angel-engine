import { describe, expect, it } from "vitest";
import { sanitizeMobileHostingConfig } from "./mobile-hosting";

describe("sanitizeMobileHostingConfig", () => {
  it("preserves valid listen ports and defaults invalid values to automatic", () => {
    expect(sanitizeMobileHostingConfig({ port: 43123 }).port).toBe(43123);
    expect(sanitizeMobileHostingConfig({ port: 0 }).port).toBe(0);
    expect(sanitizeMobileHostingConfig({ port: 65_536 }).port).toBe(0);
    expect(sanitizeMobileHostingConfig({ port: 1.5 }).port).toBe(0);
  });

  it("does not enable mobile hosting without a password", () => {
    expect(sanitizeMobileHostingConfig({ enabled: true }).enabled).toBe(false);
    expect(
      sanitizeMobileHostingConfig({ enabled: true, password: "x" }).enabled,
    ).toBe(true);
  });
});
