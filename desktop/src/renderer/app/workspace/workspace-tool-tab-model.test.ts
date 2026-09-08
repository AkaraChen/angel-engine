import type { WorkspaceToolSurfaceSnapshot } from "@shared/workspace-tool-surface";

import { describe, expect, it } from "vitest";

import {
  visibleActiveWorkspaceToolTabId,
  workspaceToolTabItems,
} from "./workspace-tool-tab-model";

describe("workspace tool tabs", () => {
  it("keeps dynamic file and diff tabs visible", () => {
    const snapshot: WorkspaceToolSurfaceSnapshot = {
      activeTabId: "file-preview:README.md",
      tabs: [
        {
          id: "file-preview:README.md",
          kind: "file-preview",
          path: "README.md",
          root: "/workspace",
          title: "README.md",
        },
        {
          id: "git-diff:worktree",
          kind: "git-diff",
          root: "/workspace",
          title: "Changes",
        },
      ],
    };

    expect(visibleActiveWorkspaceToolTabId(snapshot)).toBe(
      "file-preview:README.md",
    );
    expect(workspaceToolTabItems(snapshot.tabs).map((tab) => tab.id)).toEqual([
      "file-preview:README.md",
      "git-diff:worktree",
    ]);
  });
});
