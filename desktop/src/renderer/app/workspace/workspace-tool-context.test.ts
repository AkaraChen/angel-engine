import { describe, expect, it } from "vitest";
import { resolveWorkspaceToolContext } from "./workspace-tool-context";

describe("resolveWorkspaceToolContext", () => {
  it("keeps legacy project drafts scoped to their folder", () => {
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
        projectRoot: "/repo",
      }),
    ).toEqual({ contextKey: "project:project-1:root:/repo", root: "/repo" });
  });
  it("supports chat previews without a project record", () => {
    expect(
      resolveWorkspaceToolContext({
        selectedChatId: "chat-1",
        projectRoot: "/folder",
      }),
    ).toEqual({ contextKey: "chat:chat-1", root: "/folder" });
  });
  it("keeps a restored project chat scoped to the chat", () => {
    expect(
      resolveWorkspaceToolContext({
        projectId: "project-1",
        selectedChatId: "chat-1",
        projectRoot: "/repo/worktree",
      }),
    ).toEqual({ contextKey: "chat:chat-1", root: "/repo/worktree" });
  });
  it("supports an optional folder on a standalone draft", () => {
    expect(resolveWorkspaceToolContext({ projectRoot: "/folder" })).toEqual({
      contextKey: "draft:root:/folder",
      root: "/folder",
    });
  });
  it("does not create a preview context without a root", () => {
    expect(
      resolveWorkspaceToolContext({ selectedChatId: "chat-1" }),
    ).toBeNull();
  });
});
