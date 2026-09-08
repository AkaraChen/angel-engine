import { describe, expect, it } from "vitest";
import { currentWorkspaceToolSnapshot } from "./workspace-tool-store";

describe("workspace tool snapshot migration", () => {
  it("drops persisted browser tabs and falls back from a browser active tab", () => {
    const snapshot = currentWorkspaceToolSnapshot("chat-1", {
      "chat-1": {
        activeTabId: "browser-tab",
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

    expect(snapshot.activeTabId).toBe("dynamic");
    expect(snapshot.tabs).toEqual([]);
  });
});
