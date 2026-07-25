import type { WorkspaceToolSurfaceSnapshot } from "@shared/workspace-tool-surface";
import { describe, expect, it } from "vitest";
import { appendWorkspaceTerminalTab } from "./workspace-tool-store";

describe("workspace tool terminal tabs", () => {
  it("opens a terminal at the requested workspace root", () => {
    const current: WorkspaceToolSurfaceSnapshot = {
      activeTabId: "files",
      nextBrowserOrdinal: 1,
      nextTerminalOrdinal: 2,
      tabs: [],
    };

    expect(
      appendWorkspaceTerminalTab(current, {
        id: "tab-1",
        root: "/repo/.worktrees/功能",
        sessionId: "session-1",
      }),
    ).toEqual({
      activeTabId: "tab-1",
      nextBrowserOrdinal: 1,
      nextTerminalOrdinal: 3,
      tabs: [
        {
          id: "tab-1",
          kind: "terminal",
          root: "/repo/.worktrees/功能",
          sessionId: "session-1",
          title: "Terminal 2",
        },
      ],
    });
    expect(current.tabs).toEqual([]);
  });
});
