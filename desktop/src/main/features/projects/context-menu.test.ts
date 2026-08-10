import { DaemonRequestError } from "@angel-engine/daemon-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmDestructiveDelete: vi.fn<() => Promise<boolean>>(),
  createPathLauncherMenuItems: vi.fn(),
  deleteImpact: vi.fn<() => Promise<{ chatCount: number; revision: string }>>(),
  deleteProject:
    vi.fn<
      () => Promise<{
        deletedChatCount: number;
        deletedWorktreeCount: number;
      }>
    >(),
  popup: vi.fn(),
  resolvePathLauncherTarget: vi.fn(),
  showDestructiveBlockedNotice: vi.fn<() => Promise<void>>(),
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
      deleteImpact: mocks.deleteImpact,
    },
  },
}));

vi.mock("../destructive-confirm", async () => {
  const actual = await vi.importActual<typeof import("../destructive-confirm")>(
    "../destructive-confirm",
  );
  return {
    ...actual,
    confirmDestructiveDelete: mocks.confirmDestructiveDelete,
    showDestructiveBlockedNotice: mocks.showDestructiveBlockedNotice,
  };
});

vi.mock("../path-launcher/context-menu", () => ({
  createPathLauncherMenuItems: mocks.createPathLauncherMenuItems,
}));

vi.mock("../path-launcher/target", () => ({
  resolvePathLauncherTarget: mocks.resolvePathLauncherTarget,
}));

import { showProjectContextMenu } from "./context-menu";

async function clickDeleteItem() {
  await vi.waitFor(() => {
    expect(mocks.template.length).toBeGreaterThan(0);
  });
  const deleteItem = mocks.template.at(-1);
  deleteItem?.click?.(
    {} as Electron.MenuItem,
    undefined,
    {} as Electron.KeyboardEvent,
  );
}

describe("project context menu", () => {
  beforeEach(() => {
    mocks.deleteProject.mockReset();
    mocks.deleteImpact.mockReset();
    mocks.confirmDestructiveDelete.mockReset();
    mocks.createPathLauncherMenuItems.mockReset();
    mocks.createPathLauncherMenuItems.mockResolvedValue([
      { label: "Open in Visual Studio Code" },
    ]);
    mocks.popup.mockReset();
    mocks.resolvePathLauncherTarget.mockReset();
    mocks.resolvePathLauncherTarget.mockResolvedValue("/validated/repo");
    mocks.showDestructiveBlockedNotice.mockReset();
    mocks.showDestructiveBlockedNotice.mockResolvedValue(undefined);
    mocks.template = [];
    mocks.deleteImpact.mockResolvedValue({ chatCount: 2, revision: "rev-1" });
    mocks.confirmDestructiveDelete.mockResolvedValue(true);
    mocks.deleteProject.mockResolvedValue({
      deletedChatCount: 2,
      deletedWorktreeCount: 0,
    });
  });

  it("reports deletion after the menu closes while deletion is pending", async () => {
    let finishDelete: (() => void) | undefined;
    mocks.deleteProject.mockReturnValue(
      new Promise((resolve) => {
        finishDelete = () =>
          resolve({ deletedChatCount: 2, deletedWorktreeCount: 0 });
      }),
    );

    const result = showProjectContextMenu(
      { id: "project-1", path: "/repo" },
      { delete: "Delete", settings: "Settings" },
      undefined,
    );
    await clickDeleteItem();
    const popupOptions = mocks.popup.mock.calls[0]?.[0] as
      | Electron.PopupOptions
      | undefined;
    popupOptions?.callback?.();
    finishDelete?.();

    await expect(result).resolves.toBe("deleted");
    expect(mocks.deleteImpact).toHaveBeenCalledWith("project-1");
    expect(mocks.confirmDestructiveDelete).toHaveBeenCalledWith(
      {
        detail: expect.stringContaining("2") as string,
        message: expect.stringContaining("repo") as string,
      },
      undefined,
    );
    expect(mocks.deleteProject).toHaveBeenCalledWith({
      expectedRevision: "rev-1",
      id: "project-1",
    });
  });

  it("does not delete when the user cancels confirmation", async () => {
    mocks.confirmDestructiveDelete.mockResolvedValue(false);

    const result = showProjectContextMenu(
      { id: "project-1", path: "/repo/Release QA" },
      { delete: "Delete", settings: "Settings" },
      undefined,
    );
    await clickDeleteItem();

    await expect(result).resolves.toBe("cancelled");
    expect(mocks.deleteImpact).toHaveBeenCalledWith("project-1");
    expect(mocks.deleteProject).not.toHaveBeenCalled();
  });

  it("blocks delete when impact query fails", async () => {
    mocks.deleteImpact.mockRejectedValue(new Error("impact unavailable"));

    const result = showProjectContextMenu(
      { id: "project-1", path: "/repo" },
      { delete: "Delete", settings: "Settings" },
      undefined,
    );
    await clickDeleteItem();

    await expect(result).rejects.toThrow("impact unavailable");
    expect(mocks.confirmDestructiveDelete).not.toHaveBeenCalled();
    expect(mocks.deleteProject).not.toHaveBeenCalled();
  });

  it("shows a conflict notice and deletes nothing when the project changed", async () => {
    mocks.deleteProject.mockRejectedValue(
      DaemonRequestError.http(
        409,
        "project-delete-conflict",
        "The project changed after the delete impact was read.",
      ),
    );

    const result = showProjectContextMenu(
      { id: "project-1", path: "/repo" },
      { delete: "Delete", settings: "Settings" },
      undefined,
    );
    await clickDeleteItem();

    await expect(result).resolves.toBe("cancelled");
    expect(mocks.deleteProject).toHaveBeenCalledWith({
      expectedRevision: "rev-1",
      id: "project-1",
    });
    expect(mocks.showDestructiveBlockedNotice).toHaveBeenCalledWith(
      {
        detail: expect.stringContaining("nothing was deleted") as string,
        message: expect.any(String) as string,
      },
      undefined,
    );
  });

  it("surfaces delete failure without claiming success", async () => {
    mocks.deleteProject.mockRejectedValue(new Error("delete failed"));

    const result = showProjectContextMenu(
      { id: "project-1", path: "/repo" },
      { delete: "Delete", settings: "Settings" },
      undefined,
    );
    await clickDeleteItem();

    await expect(result).rejects.toThrow("delete failed");
  });

  it("reports the settings selection without touching the project", async () => {
    const result = showProjectContextMenu(
      { id: "project-1", path: "/repo" },
      { delete: "Delete", settings: "Settings" },
      undefined,
    );
    await vi.waitFor(() => {
      expect(mocks.template).toHaveLength(5);
    });

    const settingsItem = mocks.template.find(
      (item) => item.label === "Settings",
    );
    settingsItem?.click?.(
      {} as Electron.MenuItem,
      undefined,
      {} as Electron.KeyboardEvent,
    );
    const popupOptions = mocks.popup.mock.calls[0]?.[0] as
      | Electron.PopupOptions
      | undefined;
    popupOptions?.callback?.();

    await expect(result).resolves.toBe("settings");
    expect(mocks.deleteProject).not.toHaveBeenCalled();
  });

  it("keeps delete available when the project directory is unavailable", async () => {
    mocks.resolvePathLauncherTarget.mockRejectedValue(
      new Error("Workspace directory is unavailable."),
    );

    const result = showProjectContextMenu(
      { id: "project-1", path: "/missing" },
      { delete: "Delete", settings: "Settings" },
      undefined,
    );
    await vi.waitFor(() => {
      expect(mocks.template).toHaveLength(3);
    });
    expect(mocks.createPathLauncherMenuItems).not.toHaveBeenCalled();

    const popupOptions = mocks.popup.mock.calls[0]?.[0] as
      | Electron.PopupOptions
      | undefined;
    popupOptions?.callback?.();
    await expect(result).resolves.toBe("cancelled");
  });
});
