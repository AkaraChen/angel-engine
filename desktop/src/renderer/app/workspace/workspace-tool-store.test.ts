import type { WorkspaceToolSurfaceSnapshot } from "@shared/workspace-tool-surface";
import { describe, expect, it } from "vitest";
import {
  appendWorkspaceTerminalTab,
  currentWorkspaceToolSnapshot,
} from "./workspace-tool-store";

describe("workspace tool terminal tabs", () => {
  it("opens a terminal at the requested workspace root", () => {
    const current: WorkspaceToolSurfaceSnapshot = {
      activeTabId: "files",
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

describe("workspace tool snapshot migration", () => {
  it("drops persisted browser tabs and falls back from a browser active tab", () => {
    const snapshot = currentWorkspaceToolSnapshot("chat-1", {
      "chat-1": {
        activeTabId: "browser-tab",
        nextTerminalOrdinal: 1,
        tabs: [
          {
            browserViewId: "view-1",
            draftUrl: "https://example.com",
            id: "browser-tab",
            kind: "browser",
            title: "Browser 1",
            url: "https://example.com",
          },
          {
            id: "terminal-tab",
            kind: "terminal",
            root: "/repo",
            sessionId: "session-1",
            title: "Terminal 1",
          },
        ],
      },
    } as never);

    expect(snapshot.activeTabId).toBe("files");
    expect(snapshot.tabs).toEqual([
      {
        id: "terminal-tab",
        kind: "terminal",
        root: "/repo",
        sessionId: "session-1",
        title: "Terminal 1",
      },
    ]);
  });
});
