import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_CONFIRM_ARCHIVE_WORKSPACE_CHANNEL,
  DESKTOP_CONFIRM_DELETE_MANAGED_WORKTREES_CHANNEL,
} from "../../shared/desktop-window";

const mocks = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  handle: vi.fn(),
  on: vi.fn(),
  showMessageBox: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: { showMessageBox: mocks.showMessageBox },
  ipcMain: { handle: mocks.handle, on: mocks.on },
  nativeTheme: { themeSource: "system" },
}));

vi.mock("../platform/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("../updater", () => ({
  installDownloadedUpdate: vi.fn(),
}));

const {
  desktopWindowChromeOptionsForPlatform,
  registerDesktopWindowAppearanceIpc,
  usesCustomWindowChrome,
} = await import("./appearance");

describe("usesCustomWindowChrome", () => {
  it("keeps Linux on the native system title bar", () => {
    expect(usesCustomWindowChrome("linux")).toBe(false);
    expect(desktopWindowChromeOptionsForPlatform("linux")).toEqual({
      frame: true,
    });
  });

  it("keeps the custom chrome path on macOS", () => {
    expect(usesCustomWindowChrome("darwin")).toBe(true);
  });
});

describe("managed worktree delete confirmation", () => {
  it("accepts a zero-session orphan and rejects an empty impact", async () => {
    registerDesktopWindowAppearanceIpc();
    const registration = mocks.handle.mock.calls.find(
      ([channel]) =>
        channel === DESKTOP_CONFIRM_DELETE_MANAGED_WORKTREES_CHANNEL,
    );
    expect(registration).toBeDefined();
    const handler = registration?.[1] as (
      event: { sender: object },
      input: unknown,
    ) => Promise<boolean>;
    mocks.showMessageBox.mockResolvedValue({ response: 1 });

    await expect(
      handler({ sender: {} }, { chatCount: 0, managedWorktreeCount: 1 }),
    ).resolves.toBe(true);
    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: "settings.archived.removableWorktrees.confirmDeleteDetail",
        message: "settings.archived.removableWorktrees.confirmDeleteTitle",
      }),
    );

    mocks.showMessageBox.mockClear();
    await expect(
      handler({ sender: {} }, { chatCount: 0, managedWorktreeCount: 0 }),
    ).resolves.toBe(false);
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });
});

describe("workspace archive confirmation", () => {
  it("uses the destructive dirty-worktree warning", async () => {
    registerDesktopWindowAppearanceIpc();
    const registration = mocks.handle.mock.calls.find(
      ([channel]) => channel === DESKTOP_CONFIRM_ARCHIVE_WORKSPACE_CHANNEL,
    );
    expect(registration).toBeDefined();
    const handler = registration?.[1] as (
      event: { sender: object },
      input: unknown,
    ) => Promise<boolean>;
    mocks.showMessageBox.mockResolvedValue({ response: 1 });

    await expect(
      handler(
        { sender: {} },
        { hasUncommittedChanges: true, path: "/worktrees/feature" },
      ),
    ).resolves.toBe(true);
    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: "workspace.tools.pullRequest.archiveConfirmDirtyDetail",
        message: "workspace.tools.pullRequest.archiveConfirmTitle",
      }),
    );
  });
});
