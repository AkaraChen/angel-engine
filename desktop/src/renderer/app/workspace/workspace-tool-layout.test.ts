import { describe, expect, it } from "vitest";

import {
  initialWorkspaceToolFileTreeWidth,
  initialWorkspaceToolGitListWidth,
} from "./workspace-tool-layout";

describe("workspace tool panel widths", () => {
  it("can be imported and initialized without browser storage", () => {
    expect(initialWorkspaceToolFileTreeWidth()).toBe(288);
    expect(initialWorkspaceToolGitListWidth()).toBe(320);
  });
});
