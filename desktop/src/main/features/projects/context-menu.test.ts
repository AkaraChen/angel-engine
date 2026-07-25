import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPathLauncherMenuItems: vi.fn(),
  deleteProject: vi.fn<() => Promise<{ ok: boolean }>>(),
  popup: vi.fn(),
  resolvePathLauncherTarget: vi.fn(),
  template: [] as Electron.MenuItemConstructorOptions[],
}));

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: vi.fn(
      (template: Electron.MenuItemConstructorOptions[]) => {
        mocks.template = template;
        return { popup: mocks.popup };
      },
    ),
  },
}));

vi.mock("../../daemon/client", () => ({
  daemonClient: {
    projects: {
      delete: mocks.deleteProject,
    },
  },
}));

vi.mock("../path-launcher/context-menu", () => ({
  createPathLauncherMenuItems: mocks.createPathLauncherMenuItems,
}));

vi.mock("../path-launcher/target", () => ({
  resolvePathLauncherTarget: mocks.resolvePathLauncherTarget,
}));

import { showProjectContextMenu } from "./context-menu";

describe("project context menu", () => {
  beforeEach(() => {
    mocks.deleteProject.mockReset();
    mocks.createPathLauncherMenuItems.mockReset();
    mocks.createPathLauncherMenuItems.mockResolvedValue([
      { label: "Open in Visual Studio Code" },
    ]);
    mocks.popup.mockReset();
    mocks.resolvePathLauncherTarget.mockReset();
    mocks.resolvePathLauncherTarget.mockResolvedValue("/validated/repo");
    mocks.template = [];
  });

  it("reports deletion after the menu closes while deletion is pending", async () => {
    let finishDelete: (() => void) | undefined;
    mocks.deleteProject.mockReturnValue(
      new Promise((resolve) => {
        finishDelete = () => resolve({ ok: true });
      }),
    );

    const result = showProjectContextMenu(
      { id: "project-1", path: "/repo" },
      { delete: "Delete" },
      undefined,
    );
    await vi.waitFor(() => {
      expect(mocks.template).toHaveLength(3);
    });
    expect(mocks.resolvePathLauncherTarget).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(mocks.createPathLauncherMenuItems).toHaveBeenCalledWith(
      "/validated/repo",
      expect.any(Function),
    );
    const deleteItem = mocks.template.at(-1);
    deleteItem?.click?.(
      {} as Electron.MenuItem,
      undefined,
      {} as Electron.KeyboardEvent,
    );
    const popupOptions = mocks.popup.mock.calls[0]?.[0] as
      | Electron.PopupOptions
      | undefined;
    popupOptions?.callback?.();
    finishDelete?.();

    await expect(result).resolves.toBe("deleted");
  });

  it("keeps delete available when the project directory is unavailable", async () => {
    mocks.resolvePathLauncherTarget.mockRejectedValue(
      new Error("Workspace directory is unavailable."),
    );

    const result = showProjectContextMenu(
      { id: "project-1", path: "/missing" },
      { delete: "Delete" },
      undefined,
    );
    await vi.waitFor(() => {
      expect(mocks.template).toHaveLength(1);
    });
    expect(mocks.createPathLauncherMenuItems).not.toHaveBeenCalled();

    const popupOptions = mocks.popup.mock.calls[0]?.[0] as
      | Electron.PopupOptions
      | undefined;
    popupOptions?.callback?.();
    await expect(result).resolves.toBe("cancelled");
  });
});
