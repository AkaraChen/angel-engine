import type { PathLauncherMenuResult } from "@shared/path-launcher";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: vi.fn(async () => ({
    editors: [],
    systemTerminal: false,
  })),
}));

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: vi.fn(),
  },
}));

vi.mock("../../platform/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("./runtime", () => ({
  pathLauncher: {
    availability: mocks.availability,
    copyPath: vi.fn(),
    launchEditor: vi.fn(),
    launchFileManager: vi.fn(),
    launchSystemTerminal: vi.fn(),
  },
}));

vi.mock("./target", () => ({
  resolvePathLauncherTarget: vi.fn(),
}));

import { createPathLauncherMenuItems } from "./context-menu";

describe("path launcher context menu", () => {
  it("returns the main-verified target for Angel Terminal", async () => {
    let selected: Promise<PathLauncherMenuResult> | undefined;
    const items = await createPathLauncherMenuItems(
      "/repo/.worktrees/功能",
      (action) => {
        selected = action;
      },
      { includeAngelTerminal: true },
    );
    const terminalItem = items.find(
      ({ label }) => label === "pathLauncher.openInAngelTerminal",
    );

    terminalItem?.click?.(
      {} as Electron.MenuItem,
      undefined,
      {} as Electron.KeyboardEvent,
    );

    await expect(selected).resolves.toEqual({
      action: "open_angel_terminal",
      target: "/repo/.worktrees/功能",
    });
  });

  it("omits Angel Terminal outside the current workspace menu", async () => {
    const items = await createPathLauncherMenuItems("/repo", vi.fn());

    expect(
      items.some(({ label }) => label === "pathLauncher.openInAngelTerminal"),
    ).toBe(false);
  });
});
