import { describe, expect, it } from "vitest";
import { resolveWorkspaceToolContext } from "./workspace-tool-context";

describe("resolveWorkspaceToolContext", () => {
  it.each([
    "work",
    "power",
  ] as const)("creates project context without a chat in %s mode", (workspaceMode) => {
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
        projectRoot: "/repo",
        workspaceMode,
      }),
    ).toEqual({
      contextKey: "project:project-1:root:/repo",
      root: "/repo",
    });
  });

  it("keeps project chat tools scoped to the chat", () => {
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
        projectRoot: "/repo/worktree",
        selectedChatId: "chat-1",
        selectedChatProjectId: "project-1",
        workspaceMode: "power",
      }),
    ).toEqual({ contextKey: "chat:chat-1", root: "/repo/worktree" });
  });

  it("does not expose project tools in chat mode or without a project root", () => {
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
        projectRoot: "/repo",
        workspaceMode: "chat",
      }),
    ).toBeNull();
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
        workspaceMode: "work",
      }),
    ).toBeNull();
    expect(
      resolveWorkspaceToolContext({
        projectRoot: "/repo",
        workspaceMode: "power",
      }),
    ).toBeNull();
  });
});
