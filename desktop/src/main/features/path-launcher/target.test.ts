import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../daemon/client", () => ({
  daemonClient: {
    chats: { get: vi.fn() },
    projects: { get: vi.fn() },
  },
}));

import {
  resolvePathLauncherTarget,
  type PathLauncherTargetDependencies,
} from "./target";

function dependencies(options?: {
  chat?: Chat | null;
  directory?: boolean;
  project?: Project | null;
}): PathLauncherTargetDependencies {
  return {
    getChat: vi.fn(async () => options?.chat ?? null),
    getProject: vi.fn(
      async () =>
        options?.project ?? ({ id: "project-1", path: "/repo" } as Project),
    ),
    isDirectory: vi.fn(async () => options?.directory ?? true),
  };
}

describe("path launcher target resolution", () => {
  it("resolves a worktree cwd owned by the requested project", async () => {
    const target = await resolvePathLauncherTarget(
      { chatId: "chat-1", projectId: "project-1" },
      dependencies({
        chat: {
          cwd: "/repo/.worktrees/功能 branch",
          id: "chat-1",
          projectId: "project-1",
        } as Chat,
      }),
    );

    expect(target).toBe("/repo/.worktrees/功能 branch");
  });

  it("rejects a chat from another project", async () => {
    await expect(
      resolvePathLauncherTarget(
        { chatId: "chat-1", projectId: "project-1" },
        dependencies({
          chat: {
            cwd: "/other",
            id: "chat-1",
            projectId: "project-2",
          } as Chat,
        }),
      ),
    ).rejects.toThrow("does not belong");
  });

  it("rejects missing, relative, or non-directory workspace targets", async () => {
    await expect(
      resolvePathLauncherTarget(
        { projectId: "project-1" },
        dependencies({
          project: { id: "project-1", path: "relative/repo" } as Project,
        }),
      ),
    ).rejects.toThrow("unavailable");

    await expect(
      resolvePathLauncherTarget(
        { projectId: "project-1" },
        dependencies({ directory: false }),
      ),
    ).rejects.toThrow("unavailable");
  });
});
