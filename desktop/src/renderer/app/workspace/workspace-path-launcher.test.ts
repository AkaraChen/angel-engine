import { describe, expect, it } from "vitest";
import { resolveWorkspacePathLauncherTarget } from "./workspace-path-launcher";

const project = { id: "project-1", path: "/repo" };
const worktreeChat = {
  cwd: "/repo/.worktrees/功能",
  id: "chat-1",
  projectId: "project-1",
};

describe("workspace path launcher target", () => {
  it("uses the selected chat as the strongest workspace identity", () => {
    expect(
      resolveWorkspacePathLauncherTarget({
        chats: [worktreeChat],
        draftProjectId: "project-2",
        projects: [project],
        selectedChat: worktreeChat,
        worktree: {
          groupKey: "stale",
          projectId: "project-1",
        },
      }),
    ).toEqual({ chatId: "chat-1", projectId: "project-1" });
  });

  it("resolves a pinned Power draft through a chat owned by its worktree", () => {
    expect(
      resolveWorkspacePathLauncherTarget({
        chats: [worktreeChat],
        projects: [project],
        worktree: {
          cwd: "/repo/.worktrees/功能",
          groupKey: "project-1\u0000/repo/.worktrees/功能",
          projectId: "project-1",
        },
      }),
    ).toEqual({ chatId: "chat-1", projectId: "project-1" });
  });

  it("resolves the main worktree without requiring a chat", () => {
    expect(
      resolveWorkspacePathLauncherTarget({
        chats: [],
        projects: [project],
        worktree: {
          cwd: "/repo/",
          groupKey: "project-1\u0000main",
          projectId: "project-1",
        },
      }),
    ).toEqual({ projectId: "project-1" });
  });

  it("does not fall back to the project root for a stale non-main worktree", () => {
    expect(
      resolveWorkspacePathLauncherTarget({
        chats: [],
        draftProjectId: "project-1",
        projects: [project],
        worktree: {
          cwd: "/repo/.worktrees/deleted",
          groupKey: "project-1\u0000/repo/.worktrees/deleted",
          projectId: "project-1",
        },
      }),
    ).toBeUndefined();
  });
});
