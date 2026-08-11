import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceToolTabId,
  visibleActiveWorkspaceToolTabId,
  workspaceToolTabItems,
} from "./workspace-tool-tab-model";
import {
  workspaceToolChecksTabId,
  workspaceToolFilesTabId,
  workspaceToolPullRequestTabId,
} from "./workspace-tool-store";

describe("workspace tool tab model", () => {
  it("redirects legacy checks tab ids to the pull request tab", () => {
    expect(resolveWorkspaceToolTabId(workspaceToolChecksTabId)).toBe(
      workspaceToolPullRequestTabId,
    );
    expect(resolveWorkspaceToolTabId(workspaceToolPullRequestTabId)).toBe(
      workspaceToolPullRequestTabId,
    );
  });

  it("resolves a persisted activeTabId of checks to the pr tab", () => {
    expect(
      visibleActiveWorkspaceToolTabId({
        activeTabId: workspaceToolChecksTabId,
        nextBrowserOrdinal: 1,
        nextTerminalOrdinal: 1,
        tabs: [],
      }),
    ).toBe(workspaceToolPullRequestTabId);
  });

  it("omits the checks tab from the pinned tab list", () => {
    const items = workspaceToolTabItems([], {
      files: "Files",
      gitChanges: "Git",
      processes: "Processes",
      pullRequest: "Pull request",
    });
    expect(items.map((item) => item.id)).toEqual([
      workspaceToolFilesTabId,
      "git",
      workspaceToolPullRequestTabId,
      "processes",
    ]);
    expect(items.some((item) => item.id === workspaceToolChecksTabId)).toBe(
      false,
    );
  });
});
