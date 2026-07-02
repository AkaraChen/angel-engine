import { describe, expect, it } from "vitest";

import { isTextLikeMimeType } from "./mime";

describe("isTextLikeMimeType", () => {
  it("detects text-like media types without Node mime helpers", () => {
    expect(isTextLikeMimeType("text/plain; charset=utf-8")).toBe(true);
    expect(isTextLikeMimeType("application/json")).toBe(true);
    expect(isTextLikeMimeType("application/activity+json")).toBe(false);
    expect(isTextLikeMimeType("image/svg+xml")).toBe(false);
    expect(isTextLikeMimeType("image/png")).toBe(false);
  });
});
