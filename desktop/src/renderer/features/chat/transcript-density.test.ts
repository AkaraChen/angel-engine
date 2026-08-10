import { describe, expect, it } from "vitest";

import {
  defaultToolDetailsOpen,
  densityForWorkspaceMode,
} from "./transcript-density";

describe("densityForWorkspaceMode", () => {
  it("locks chat mode to compact and other modes to normal", () => {
    expect(densityForWorkspaceMode("chat")).toBe("compact");
    expect(densityForWorkspaceMode("work")).toBe("normal");
    expect(densityForWorkspaceMode("power")).toBe("normal");
  });
});

describe("defaultToolDetailsOpen", () => {
  it("keeps compact mode collapsed so tool spam stays out of the way", () => {
    expect(defaultToolDetailsOpen("compact", false)).toBe(false);
    expect(defaultToolDetailsOpen("compact", true)).toBe(false);
  });

  it("preserves normal auto-open when nothing follows the tool", () => {
    expect(defaultToolDetailsOpen("normal", false)).toBe(true);
    expect(defaultToolDetailsOpen("normal", true)).toBe(false);
  });
});
