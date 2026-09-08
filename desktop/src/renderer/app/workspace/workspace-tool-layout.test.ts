import { describe, expect, it } from "vitest";

import {
  initialWorkspaceToolFileTreeWidth,
} from "./workspace-tool-layout";

describe("workspace tool panel widths", () => {
  it("can be imported and initialized without browser storage", () => {
    expect(initialWorkspaceToolFileTreeWidth()).toBe(288);
  });
});
