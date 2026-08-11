import { afterEach, describe, expect, it, vi } from "vitest";

import { createPageFreezer, type FreezeWindow } from "./design-mode-freeze";

describe("createPageFreezer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues timers while frozen and flushes them on unfreeze", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const win = {
      cancelAnimationFrame: vi.fn(),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => {
        return window.setTimeout(() => cb(0), 0) as unknown as number;
      }),
      setInterval: vi.fn((handler: TimerHandler, delay?: number) => {
        return window.setInterval(handler as TimerHandler, delay ?? 0);
      }),
      setTimeout: vi.fn((handler: TimerHandler, delay?: number) => {
        return window.setTimeout(handler as TimerHandler, delay ?? 0);
      }),
    } as unknown as FreezeWindow;

    // Bind real timers onto the mock for the "original" path after unfreeze.
    win.setTimeout = ((
      handler: TimerHandler,
      delay = 0,
      ...args: unknown[]
    ) => {
      const handle = globalThis.setTimeout(() => {
        if (typeof handler === "function") {
          handler(...args);
        }
      }, delay);
      return handle as unknown as number;
    }) as FreezeWindow["setTimeout"];
    win.clearTimeout = ((id: number | undefined) => {
      if (typeof id === "number") {
        globalThis.clearTimeout(id);
      }
    }) as FreezeWindow["clearTimeout"];
    win.setInterval = ((
      handler: TimerHandler,
      delay = 0,
      ...args: unknown[]
    ) => {
      const handle = globalThis.setInterval(() => {
        if (typeof handler === "function") {
          handler(...args);
        }
      }, delay);
      return handle as unknown as number;
    }) as FreezeWindow["setInterval"];
    win.clearInterval = ((id: number | undefined) => {
      if (typeof id === "number") {
        globalThis.clearInterval(id);
      }
    }) as FreezeWindow["clearInterval"];
    win.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      globalThis.setTimeout(
        () => cb(0),
        0,
      ) as unknown as number) as FreezeWindow["requestAnimationFrame"];
    win.cancelAnimationFrame = ((id: number) => {
      globalThis.clearTimeout(id);
    }) as FreezeWindow["cancelAnimationFrame"];

    const freezer = createPageFreezer(win);
    freezer.freeze();

    win.setTimeout(() => {
      calls.push("timeout");
    }, 50);
    win.requestAnimationFrame(() => {
      calls.push("raf");
    });

    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]);

    freezer.unfreeze();
    vi.advanceTimersByTime(100);
    expect(calls).toContain("timeout");
    expect(calls).toContain("raf");
    expect(calls).toHaveLength(2);
  });

  it("pauses running animations on freeze and plays them on unfreeze", () => {
    const animation = {
      pause: vi.fn(),
      play: vi.fn(),
      playState: "running",
    };
    const win = {
      cancelAnimationFrame: vi.fn(),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      document: {
        getAnimations: () => [animation],
      },
      requestAnimationFrame: vi.fn(),
      setInterval: vi.fn(),
      setTimeout: vi.fn(),
    } as unknown as FreezeWindow;

    const freezer = createPageFreezer(win);
    freezer.freeze();
    expect(animation.pause).toHaveBeenCalledTimes(1);

    animation.playState = "paused";
    freezer.unfreeze();
    expect(animation.play).toHaveBeenCalledTimes(1);
  });

  it("is idempotent for freeze and unfreeze", () => {
    const win = {
      cancelAnimationFrame: vi.fn(),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      requestAnimationFrame: vi.fn(),
      setInterval: vi.fn(),
      setTimeout: vi.fn(),
    } as unknown as FreezeWindow;

    const freezer = createPageFreezer(win);
    freezer.freeze();
    freezer.freeze();
    expect(freezer.isFrozen()).toBe(true);
    freezer.unfreeze();
    freezer.unfreeze();
    expect(freezer.isFrozen()).toBe(false);
  });
});

type TimerHandler = (...args: unknown[]) => void;
