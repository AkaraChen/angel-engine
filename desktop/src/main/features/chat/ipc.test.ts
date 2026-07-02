import type { Chat } from "../../../shared/chat";
import os from "node:os";
import path from "node:path";

import { describe, expect, test, vi } from "vitest";

const tipcMock = vi.hoisted(() => {
  const procedure = {
    action: (handler: unknown) => handler,
    input: () => procedure,
  };
  return { procedure };
});

vi.mock("@egoist/tipc/main", () => ({
  tipc: {
    create: () => ({ procedure: tipcMock.procedure }),
  },
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
  BrowserWindow: { fromWebContents: vi.fn() },
  clipboard: { writeText: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
}));

import { removableManagedWorktreesForChats } from "./ipc";

function chat(id: string, cwd: string | null): Chat {
  return {
    archived: false,
    createdAt: "2026-07-02T00:00:00.000Z",
    cwd,
    id,
    projectId: null,
    remoteThreadId: null,
    runtime: "kimi",
    title: id,
    updatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function managedWorktree(project: string, suffix: string) {
  return path.join(os.homedir(), ".angel-engine", "worktrees", project, suffix);
}

describe("removableManagedWorktreesForChats", () => {
  test("selects the managed worktree when only deleted chats reference it", () => {
    const cwd = managedWorktree("repo", "branch");

    expect(
      removableManagedWorktreesForChats([chat("deleted", cwd)], []),
    ).toEqual([cwd]);
  });

  test("keeps a managed worktree referenced by a surviving chat", () => {
    const cwd = managedWorktree("repo", "branch");

    expect(
      removableManagedWorktreesForChats(
        [chat("deleted", cwd)],
        [chat("survivor", cwd)],
      ),
    ).toEqual([]);
  });

  test("ignores non-managed chat directories", () => {
    expect(
      removableManagedWorktreesForChats([chat("deleted", "/tmp/repo")], []),
    ).toEqual([]);
  });
});
