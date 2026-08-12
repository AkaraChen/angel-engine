import { describe, expect, it } from "vitest";

import {
  designModeOriginFromUrl,
  isDefaultDesignModeAllowedHost,
  isDesignModeAllowedOrigin,
} from "./workspace-browser";

describe("design mode origin allowlist", () => {
  it("allows loopback preview hosts by default", () => {
    expect(isDefaultDesignModeAllowedHost("localhost")).toBe(true);
    expect(isDefaultDesignModeAllowedHost("app.localhost")).toBe(true);
    expect(isDefaultDesignModeAllowedHost("127.0.0.1")).toBe(true);
    expect(isDefaultDesignModeAllowedHost("::1")).toBe(true);
    expect(isDesignModeAllowedOrigin("http://localhost:5173/app")).toBe(true);
    expect(isDesignModeAllowedOrigin("https://127.0.0.1:3000")).toBe(true);
  });

  it("rejects non-loopback origins unless explicitly registered", () => {
    expect(isDesignModeAllowedOrigin("https://example.com")).toBe(false);
    expect(isDesignModeAllowedOrigin("http://192.168.1.10:5173")).toBe(false);
    expect(
      isDesignModeAllowedOrigin("http://192.168.1.10:5173", [
        "http://192.168.1.10:5173",
      ]),
    ).toBe(true);
    expect(
      isDesignModeAllowedOrigin("http://192.168.1.10:5173/path", [
        "http://192.168.1.10:5173",
      ]),
    ).toBe(true);
  });

  it("rejects blank and non-http origins", () => {
    expect(designModeOriginFromUrl("about:blank")).toBeNull();
    expect(designModeOriginFromUrl("")).toBeNull();
    expect(isDesignModeAllowedOrigin("about:blank")).toBe(false);
    expect(isDesignModeAllowedOrigin("file:///tmp/index.html")).toBe(false);
  });
});
