import type { WorkspaceToolSurfaceSnapshot } from "@shared/workspace-tool-surface";

import { describe, expect, it } from "vitest";

import { redirectChecksTabToPullRequest } from "./workspace-tool-checks-focus";
import {
  visibleActiveWorkspaceToolTabId,
  workspaceToolTabItems,
} from "./workspace-tool-tab-model";

describe("workspace tool pinned tabs", () => {
  it("redirects a persisted checks tab to the pull request panel", () => {
    const snapshot: WorkspaceToolSurfaceSnapshot = {
      activeTabId: "checks",
      tabs: [],
    };

    expect(visibleActiveWorkspaceToolTabId(snapshot)).toBe("pr");
    expect(redirectChecksTabToPullRequest(snapshot)).toEqual({
      ...snapshot,
      activeTabId: "pr",
      focusSection: "checks",
    });
    expect(
      workspaceToolTabItems([], {
        gitChanges: "Git changes",
        pullRequest: "Pull request",
      }).map((tab) => tab.id),
    ).toEqual(["git", "pr"]);
  });
});
