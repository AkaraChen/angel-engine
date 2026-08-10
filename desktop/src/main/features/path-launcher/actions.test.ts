import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: vi.fn(async () => ({
    editors: [{ id: "vscode" as const, name: "VS Code" }],
    systemTerminal: true,
  })),
  copyPath: vi.fn(),
  launchEditor: vi.fn(async () => undefined),
  launchFileManager: vi.fn(async () => undefined),
  launchSystemTerminal: vi.fn(async () => undefined),
  resolveTarget: vi.fn(async () => "/repo/.worktrees/功能"),
}));

vi.mock("./runtime", () => ({
  pathLauncher: {
    availability: mocks.availability,
    copyPath: mocks.copyPath,
    launchEditor: mocks.launchEditor,
    launchFileManager: mocks.launchFileManager,
    launchSystemTerminal: mocks.launchSystemTerminal,
  },
}));

vi.mock("./target", () => ({
  resolvePathLauncherTarget: mocks.resolveTarget,
}));

import { invokePathLauncherAction } from "./actions";

const ref = { projectId: "project-1" };

describe("path launcher actions", () => {
  it("returns the main-verified target for Angel Terminal", async () => {
    await expect(
      invokePathLauncherAction(ref, "angelTerminal"),
    ).resolves.toEqual({
      action: "open_angel_terminal",
      target: "/repo/.worktrees/功能",
    });
  });

  it("copies the resolved path", async () => {
    await expect(invokePathLauncherAction(ref, "copyPath")).resolves.toBe(
      "copied",
    );
    expect(mocks.copyPath).toHaveBeenCalledWith("/repo/.worktrees/功能");
  });

  it("launches an available editor", async () => {
    await expect(invokePathLauncherAction(ref, "editor:vscode")).resolves.toBe(
      "opened",
    );
    expect(mocks.launchEditor).toHaveBeenCalledWith(
      "vscode",
      "/repo/.worktrees/功能",
    );
  });

  it("rejects an editor the host does not have", async () => {
    await expect(
      invokePathLauncherAction(ref, "editor:cursor"),
    ).rejects.toThrow(/not available/);
  });
});
