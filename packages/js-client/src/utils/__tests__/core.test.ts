import { describe, expect, it } from "vitest";
import { createId, nowIso } from "../core";

describe("core utils", () => {
  it("creates ids with a typed prefix", () => {
    const id: string = createId("chat");

    expect(id).toMatch(/^chat-/);
  });

  it("returns an ISO timestamp", () => {
    const timestamp: string = nowIso();

    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  });
});
