import { describe, expect, it } from "vitest";

import { parseShepherdSourceCard } from "./parse-shepherd-source-card";

describe("parseShepherdSourceCard", () => {
  it("splits the daemon prompt header from the body", () => {
    const text = [
      "🐑 Shepherd round 3/10 · 触发：`build` failed",
      "",
      "## Required check failures",
      "- build → failure",
    ].join("\n");

    expect(parseShepherdSourceCard(text)).toEqual({
      body: "## Required check failures\n- build → failure",
      header: "🐑 Shepherd round 3/10 · 触发：`build` failed",
    });
  });

  it("returns null for ordinary user messages", () => {
    expect(parseShepherdSourceCard("please fix the tests")).toBeNull();
  });

  it("handles a header-only prompt", () => {
    expect(
      parseShepherdSourceCard("🐑 Shepherd round 1/10 · 触发：PR 需要处理"),
    ).toEqual({
      body: "",
      header: "🐑 Shepherd round 1/10 · 触发：PR 需要处理",
    });
  });
});
