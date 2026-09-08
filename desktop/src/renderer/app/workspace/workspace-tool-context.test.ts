import { describe, expect, it } from "vitest";
import { resolveWorkspaceToolContext } from "./workspace-tool-context";

describe("resolveWorkspaceToolContext", () => {
  it("creates project context without a chat", () => {
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
        projectRoot: "/repo",
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
      }),
    ).toEqual({ contextKey: "chat:chat-1", root: "/repo/worktree" });
  });

  it("requires a project root", () => {
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
      }),
    ).toBeNull();
    expect(
      resolveWorkspaceToolContext({
        projectRoot: "/repo",
      }),
    ).toBeNull();
  });
});
