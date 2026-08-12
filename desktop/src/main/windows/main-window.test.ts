import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const windows: Array<{
    close: () => void;
    focus: () => void;
    isDestroyed: () => boolean;
    on: (event: string, handler: () => void) => void;
  }> = [];

  return {
    createDesktopWindow: vi.fn(() => {
      let destroyed = false;
      let onClosed: (() => void) | undefined;
      const window = {
        close: () => {
          destroyed = true;
          onClosed?.();
        },
        focus: vi.fn(),
        isDestroyed: () => destroyed,
        on: (event: string, handler: () => void) => {
          if (event === "closed") onClosed = handler;
        },
      };
      windows.push(window);
      return window;
    }),
    windows,
  };
});

vi.mock("./factory", () => ({
  createDesktopWindow: mocks.createDesktopWindow,
}));

const { ensureMainWindow } = await import("./main-window");

describe("main window lifecycle", () => {
  beforeEach(() => {
    mocks.createDesktopWindow.mockClear();
    mocks.windows.at(-1)?.close();
    mocks.windows.length = 0;
  });

  it("recreates main after it closes while auxiliary windows may remain", () => {
    const first = ensureMainWindow();
    first.close();

    const next = ensureMainWindow();

    expect(next).not.toBe(first);
    expect(mocks.createDesktopWindow).toHaveBeenCalledTimes(2);
  });
});
