import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  handle: vi.fn(),
  on: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: { handle: mocks.handle, on: mocks.on },
  nativeTheme: { themeSource: "system" },
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
