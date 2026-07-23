import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn<() => Promise<{ ok: boolean }>>(),
  popup: vi.fn(),
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
  shell: { openPath: vi.fn() },
}));

vi.mock("../../daemon/client", () => ({
  daemonClient: {
    projects: {
      delete: mocks.deleteProject,
    },
  },
}));

import { showProjectContextMenu } from "./context-menu";

describe("project context menu", () => {
  beforeEach(() => {
    mocks.deleteProject.mockReset();
    mocks.popup.mockReset();
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
      { delete: "Delete", openInFinder: "Open in Finder" },
      undefined,
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
});
