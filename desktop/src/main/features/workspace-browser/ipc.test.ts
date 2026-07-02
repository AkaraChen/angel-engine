import { describe, expect, it, vi } from "vitest";

import {
  parseWorkspaceBrowserBounds,
  parseWorkspaceBrowserCreateInput,
  parseWorkspaceBrowserNavigateInput,
} from "./ipc";

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getAllWindows: () => [],
  },
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
  WebContentsView: vi.fn(),
}));

describe("workspace browser IPC input parsing", () => {
  it("trims ids and rounds bounds", () => {
    expect(
      parseWorkspaceBrowserCreateInput({
        browserViewId: " browser ",
        url: " https://example.com ",
      }),
    ).toEqual({
      browserViewId: "browser",
      url: "https://example.com",
    });

    expect(
      parseWorkspaceBrowserBounds({
        height: 0.49,
        width: 80.5,
        x: -10.4,
        y: 4.5,
      }),
    ).toEqual({
      height: 1,
      width: 81,
      x: -10,
      y: 5,
    });
  });

  it("rejects malformed workspace browser input", () => {
    expect(() => parseWorkspaceBrowserNavigateInput(null)).toThrow();
    expect(() =>
      parseWorkspaceBrowserNavigateInput({
        browserViewId: "browser",
        url: " ",
      }),
    ).toThrow();
    expect(() =>
      parseWorkspaceBrowserBounds({
        height: 20,
        width: Infinity,
        x: 0,
        y: 0,
      }),
    ).toThrow();
  });
});
