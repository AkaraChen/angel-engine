import type { Chat } from "@shared/chat";
import { describe, expect, it } from "vitest";
import {
  chatWorktreeGroupKey,
  groupProjectChatsByWorktree,
} from "./worktree-grouping";

const project = { id: "project-id", path: "/home/user/repo" };

function chat(input: Partial<Chat> & Pick<Chat, "id">): Chat {
  return {
    archived: false,
    createdAt: "2026-07-04T00:00:00.000Z",
    cwd: null,
    projectId: project.id,
    remoteThreadId: null,
    runtime: "codex",
    title: input.id,
    updatedAt: "2026-07-04T00:00:00.000Z",
    ...input,
  };
}

describe("chatWorktreeGroupKey", () => {
  it("maps project-root and missing cwds to the same main group", () => {
    const rootChat = chat({ cwd: project.path, id: "root" });
    const trailingSlashChat = chat({ cwd: `${project.path}/`, id: "slash" });
    const noCwdChat = chat({ id: "no-cwd" });

    const rootKey = chatWorktreeGroupKey(rootChat, project.path);
    expect(rootKey).toBeDefined();
    expect(chatWorktreeGroupKey(trailingSlashChat, project.path)).toBe(rootKey);
    expect(chatWorktreeGroupKey(noCwdChat, project.path)).toBe(rootKey);
  });

  it("gives distinct worktree cwds distinct keys", () => {
    const firstWorktreeChat = chat({
      cwd: "/home/user/.angel-engine/worktrees/repo/abc12345",
      id: "first",
    });
    const secondWorktreeChat = chat({
      cwd: "/home/user/.angel-engine/worktrees/repo/def67890",
      id: "second",
    });

    const firstKey = chatWorktreeGroupKey(firstWorktreeChat, project.path);
    const secondKey = chatWorktreeGroupKey(secondWorktreeChat, project.path);
    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).not.toBe(
      chatWorktreeGroupKey(chat({ id: "root" }), project.path),
    );
  });

  it("returns undefined for standalone chats", () => {
    expect(
      chatWorktreeGroupKey(chat({ id: "standalone", projectId: null }), "/x"),
    ).toBe(undefined);
  });
});

describe("groupProjectChatsByWorktree", () => {
  it("groups chats into main and per-worktree groups", () => {
    const rootChat = chat({ cwd: project.path, id: "root" });
    const worktreeCwd = "/home/user/.angel-engine/worktrees/repo/abc12345";
    const worktreeChatA = chat({ cwd: worktreeCwd, id: "wt-a" });
    const worktreeChatB = chat({ cwd: worktreeCwd, id: "wt-b" });

    const groups = groupProjectChatsByWorktree(
      [rootChat, worktreeChatA, worktreeChatB],
      project,
      "Main",
    );

    expect(groups).toHaveLength(2);
    const [main, worktree] = groups;
    expect(main.isMain).toBe(true);
    expect(main.label).toBe("Main");
    expect(main.chats.map((item) => item.id)).toEqual(["root"]);
    expect(worktree.isMain).toBe(false);
    expect(worktree.label).toBe("abc12345");
    expect(worktree.cwd).toBe(worktreeCwd);
    expect(worktree.chats.map((item) => item.id)).toEqual(["wt-a", "wt-b"]);
  });

  it("always includes the main group even when empty", () => {
    const groups = groupProjectChatsByWorktree([], project, "Main");

    expect(groups).toHaveLength(1);
    expect(groups[0].isMain).toBe(true);
    expect(groups[0].chats).toEqual([]);
  });
});
