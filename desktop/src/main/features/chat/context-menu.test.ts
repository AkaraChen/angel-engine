import type { Chat } from "@angel-engine/daemon-api/chat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmDestructiveDelete: vi.fn<() => Promise<boolean>>(),
  deleteChat: vi.fn<() => Promise<{ ok: boolean }>>(),
  popup: vi.fn(),
  setPinned: vi.fn<() => Promise<Chat>>(),
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
  app: { isPackaged: true },
  clipboard: { writeText: vi.fn() },
}));

vi.mock("../../daemon/client", () => ({
  daemonClient: {
    chats: {
      delete: mocks.deleteChat,
      setPinned: mocks.setPinned,
    },
  },
}));

vi.mock("../../platform/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("../destructive-confirm", async () => {
  const actual = await vi.importActual<typeof import("../destructive-confirm")>(
    "../destructive-confirm",
  );
  return {
    ...actual,
    confirmDestructiveDelete: mocks.confirmDestructiveDelete,
  };
});

import { showChatContextMenu } from "./context-menu";

const sampleChat = {
  archived: false,
  createdAt: "2026-01-01T00:00:00Z",
  cwd: "/repo",
  id: "chat-1",
  pinned: false,
  projectId: "project-1",
  remoteThreadId: null,
  runtime: "codex",
  title: "Desktop verification",
  updatedAt: "2026-01-01T00:00:00Z",
} as Chat;

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

describe("chat context menu", () => {
  beforeEach(() => {
    mocks.deleteChat.mockReset();
    mocks.confirmDestructiveDelete.mockReset();
    mocks.setPinned.mockReset();
    mocks.popup.mockReset();
    mocks.template = [];
    mocks.confirmDestructiveDelete.mockResolvedValue(true);
    mocks.deleteChat.mockResolvedValue({ ok: true });
  });

  it("deletes after confirmation", async () => {
    const result = showChatContextMenu(sampleChat, undefined);
    await clickDeleteItem();

    await expect(result).resolves.toBe("deleted");
    expect(mocks.confirmDestructiveDelete).toHaveBeenCalledWith(
      {
        detail: "dialog.confirmDeleteChatDetail",
        message: "dialog.confirmDeleteChatTitle",
      },
      undefined,
    );
    expect(mocks.deleteChat).toHaveBeenCalledWith("chat-1");
  });

  it("does not delete when confirmation is cancelled", async () => {
    mocks.confirmDestructiveDelete.mockResolvedValue(false);

    const result = showChatContextMenu(sampleChat, undefined);
    await clickDeleteItem();

    await expect(result).resolves.toBe("cancelled");
    expect(mocks.deleteChat).not.toHaveBeenCalled();
  });

  it("surfaces delete failure without claiming success", async () => {
    mocks.deleteChat.mockRejectedValue(new Error("delete failed"));

    const result = showChatContextMenu(sampleChat, undefined);
    await clickDeleteItem();

    await expect(result).rejects.toThrow("delete failed");
  });

  it("reports rename without deleting", async () => {
    const result = showChatContextMenu(sampleChat, undefined);
    await vi.waitFor(() => {
      expect(mocks.template.length).toBeGreaterThan(0);
    });
    const renameItem = mocks.template.find(
      (item) => item.label === "common.rename",
    );
    renameItem?.click?.(
      {} as Electron.MenuItem,
      undefined,
      {} as Electron.KeyboardEvent,
    );

    await expect(result).resolves.toBe("rename");
    expect(mocks.deleteChat).not.toHaveBeenCalled();
  });
});
