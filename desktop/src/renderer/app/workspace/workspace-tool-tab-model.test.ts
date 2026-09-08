import type { WorkspaceToolSurfaceSnapshot } from "@shared/workspace-tool-surface";

import { describe, expect, it } from "vitest";

import {
  visibleActiveWorkspaceToolTabId,
  workspaceToolTabItems,
} from "./workspace-tool-tab-model";

describe("workspace tool tabs", () => {
  it("keeps unknown persisted tabs on files", () => {
    const snapshot: WorkspaceToolSurfaceSnapshot = {
      activeTabId: "legacy-git",
      nextBrowserOrdinal: 1,
      nextTerminalOrdinal: 1,
      tabs: [],
    };
    expect(visibleActiveWorkspaceToolTabId(snapshot)).toBe("files");
  });

  it("keeps only the shared files and processes pinned tabs", () => {
    expect(
      workspaceToolTabItems([], { files: "Files", processes: "Processes" }).map(
        (tab) => tab.id,
      ),
    ).toEqual(["files", "processes"]);
  });
});
