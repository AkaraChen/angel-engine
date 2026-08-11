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
      nextBrowserOrdinal: 1,
      nextTerminalOrdinal: 1,
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
        files: "Files",
        gitChanges: "Git changes",
        processes: "Processes",
        pullRequest: "Pull request",
      }).map((tab) => tab.id),
    ).toEqual(["files", "git", "pr", "processes"]);
  });
});
