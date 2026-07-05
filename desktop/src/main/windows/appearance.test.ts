import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  nativeTheme: { themeSource: "system" },
}));

vi.mock("../platform/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("../updater", () => ({
  installDownloadedUpdate: vi.fn(),
}));

const { desktopWindowChromeOptionsForPlatform, usesCustomWindowChrome } =
  await import("./appearance");

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
