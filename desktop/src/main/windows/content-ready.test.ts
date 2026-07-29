import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_WINDOW_CONTENT_READY_CHANNEL } from "../../shared/desktop-window";

const mocks = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  on: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: { on: mocks.on },
}));

vi.mock("electron-log/main", () => ({
  default: { warn: vi.fn() },
}));

const {
  isDesktopWindowContentReady,
  registerDesktopWindowContentReadyIpc,
  showDesktopWindowWhenContentReady,
} = await import("./content-ready");

interface FakeWindow {
  focus: ReturnType<typeof vi.fn>;
  id: number;
  isDestroyed: () => boolean;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  show: ReturnType<typeof vi.fn>;
  webContents: {
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  };
}

let nextWindowId = 1;

function createFakeWindow() {
  const windowListeners = new Map<string, (...args: unknown[]) => void>();
  const webContentsListeners = new Map<string, (...args: unknown[]) => void>();

  const window: FakeWindow = {
    focus: vi.fn(),
    id: nextWindowId++,
    isDestroyed: () => false,
    on: (event, listener) => {
      windowListeners.set(event, listener);
    },
    show: vi.fn(),
    webContents: {
      on: (event, listener) => {
        webContentsListeners.set(event, listener);
      },
    },
  };

  return {
    emit: (event: string, ...args: unknown[]) =>
      windowListeners.get(event)?.(...args),
    emitWebContents: (event: string, ...args: unknown[]) =>
      webContentsListeners.get(event)?.(...args),
    window,
  };
}

function emitContentReady(window: FakeWindow) {
  const listener = mocks.on.mock.calls.find(
    ([channel]) => channel === DESKTOP_WINDOW_CONTENT_READY_CHANNEL,
  )?.[1] as (event: { sender: unknown }) => void;
  mocks.fromWebContents.mockReturnValue(window);
  listener({ sender: window.webContents });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.on.mockClear();
  registerDesktopWindowContentReadyIpc();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("showDesktopWindowWhenContentReady", () => {
  it("keeps the window hidden until the renderer reports painted content", () => {
    const { window } = createFakeWindow();
    const beforeShow = vi.fn();

    showDesktopWindowWhenContentReady(window as never, { beforeShow });

    expect(window.show).not.toHaveBeenCalled();
    expect(isDesktopWindowContentReady(window as never)).toBe(false);

    emitContentReady(window);

    expect(beforeShow).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(isDesktopWindowContentReady(window as never)).toBe(true);
  });

  it("shows the window anyway once the readiness deadline passes", () => {
    const { window } = createFakeWindow();

    showDesktopWindowWhenContentReady(window as never, { timeoutMs: 1_000 });

    vi.advanceTimersByTime(999);
    expect(window.show).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(window.show).toHaveBeenCalledOnce();

    // A late readiness report must not show the window a second time.
    emitContentReady(window);
    expect(window.show).toHaveBeenCalledOnce();
  });

  it("shows the window when the main frame fails to load", () => {
    const { emitWebContents, window } = createFakeWindow();

    showDesktopWindowWhenContentReady(window as never);

    emitWebContents("did-fail-load", {}, -6, "FILE_NOT_FOUND", "app://", false);
    expect(window.show).not.toHaveBeenCalled();

    emitWebContents("did-fail-load", {}, -6, "FILE_NOT_FOUND", "app://", true);
    expect(window.show).toHaveBeenCalledOnce();
  });

  it("forgets readiness when the window closes", () => {
    const { emit, window } = createFakeWindow();

    showDesktopWindowWhenContentReady(window as never);
    emitContentReady(window);
    expect(isDesktopWindowContentReady(window as never)).toBe(true);

    emit("closed");
    expect(isDesktopWindowContentReady(window as never)).toBe(false);
  });
});
