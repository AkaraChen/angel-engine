import { describe, expect, it } from "vitest";

import {
  defaultTurnActivityDisplay,
  nextTurnActivityDisplay,
} from "@/features/chat/components/turn-activity-state";

describe("turn activity display", () => {
  it("keeps active turns visible and completed turns collapsed by default", () => {
    expect(defaultTurnActivityDisplay(true)).toBe("summary");
    expect(defaultTurnActivityDisplay(false)).toBe("collapsed");
  });

  it("cycles through collapsed, summary, and expanded", () => {
    expect(nextTurnActivityDisplay("collapsed")).toBe("summary");
    expect(nextTurnActivityDisplay("summary")).toBe("expanded");
    expect(nextTurnActivityDisplay("expanded")).toBe("collapsed");
  });
});
