import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PAGE_FREEZE_ATTR,
  PAGE_FREEZE_READY_ATTR,
  buildMainWorldFreezeInstallScript,
  createPageFreezer,
  setPageFreezeAttribute,
  type FreezeWindow,
} from "./design-mode-freeze";

describe("createPageFreezer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues timers while frozen and flushes them on unfreeze", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const win = createRealTimerWindow();

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

  it("cancels outstanding pre-freeze timers (does not let them fire while frozen)", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const win = createRealTimerWindow();

    win.setTimeout(() => {
      calls.push("pre-freeze");
    }, 30);

    const freezer = createPageFreezer(win);
    freezer.freeze();

    vi.advanceTimersByTime(100);
    expect(calls).toEqual([]);

    freezer.unfreeze();
    vi.advanceTimersByTime(100);
    // Pre-freeze handles are cancelled, not deferred.
    expect(calls).not.toContain("pre-freeze");
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

/**
 * Main-world install script + attribute protocol.
 *
 * We simulate a page window without JSDOM (import hangs in some envs) by
 * building a minimal documentElement + timer surface and eval'ing the install
 * source against it via a Function bound to that window as `this` / globals.
 */
describe("main-world freeze install script (page setInterval / rAF)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buildMainWorldFreezeInstallScript embeds freeze attr names and no window API", () => {
    const source = buildMainWorldFreezeInstallScript();
    expect(source).toContain(PAGE_FREEZE_ATTR);
    expect(source).toContain(PAGE_FREEZE_READY_ATTR);
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("setInterval");
    expect(source).not.toMatch(/window\.__angel/i);
    expect(source).not.toMatch(/window\.angelDesign/i);
  });

  it("pauses page setInterval and rAF while freeze attr is 1, resumes on 0", () => {
    vi.useFakeTimers();
    const page = createMinimalPageWindow();
    installMainWorldFreezeOnPage(page);

    expect(
      page.document.documentElement.getAttribute(PAGE_FREEZE_READY_ATTR),
    ).toBe("1");

    const calls: string[] = [];
    setPageFreezeAttribute(page.document.documentElement, true);
    // Install script uses MutationObserver; flush microtasks then attribute sync.
    flushMicrotasks();
    // Also call sync path by re-setting attr (observer may not exist without DOM).
    // Our minimal page wires attr observer via MutationObserver polyfill below.
    page.__syncFreezeFromAttr();

    page.setInterval(() => {
      calls.push("interval");
    }, 20);
    page.requestAnimationFrame(() => {
      calls.push("raf");
    });
    page.setTimeout(() => {
      calls.push("timeout");
    }, 40);

    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]);

    setPageFreezeAttribute(page.document.documentElement, false);
    page.__syncFreezeFromAttr();
    vi.advanceTimersByTime(100);
    expect(calls).toContain("interval");
    expect(calls).toContain("raf");
    expect(calls).toContain("timeout");
  });

  it("does not expose a page-callable freeze API on window", () => {
    const page = createMinimalPageWindow();
    installMainWorldFreezeOnPage(page);
    expect((page as unknown as Record<string, unknown>).angel).toBeUndefined();
    expect(
      (page as unknown as Record<string, unknown>).angelDesignFreeze,
    ).toBeUndefined();
    expect(
      (page as unknown as Record<string, unknown>).__angelDesignFreeze,
    ).toBeUndefined();
  });
});

interface MinimalPageWindow extends FreezeWindow {
  document: {
    documentElement: MinimalElement;
    getAnimations?: () => [];
  };
  eval: (code: string) => unknown;
  __syncFreezeFromAttr: () => void;
  MutationObserver: typeof MutationObserverStub;
}

interface MinimalElement {
  attributes: Map<string, string>;
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  _listeners: Array<() => void>;
}

class MutationObserverStub {
  private callback: MutationCallback;
  constructor(callback: MutationCallback) {
    this.callback = callback;
  }
  observe(target: MinimalElement) {
    target._listeners.push(() => {
      this.callback(
        [] as unknown as MutationRecord[],
        this as unknown as MutationObserver,
      );
    });
  }
  disconnect() {}
  takeRecords(): MutationRecord[] {
    return [];
  }
}

function createMinimalPageWindow(): MinimalPageWindow {
  const attributes = new Map<string, string>();
  const listeners: Array<() => void> = [];
  const documentElement: MinimalElement = {
    attributes,
    _listeners: listeners,
    getAttribute(name) {
      return attributes.has(name) ? (attributes.get(name) as string) : null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
      for (const listener of listeners) {
        listener();
      }
    },
    removeAttribute(name) {
      attributes.delete(name);
      for (const listener of listeners) {
        listener();
      }
    },
  };

  const page = {
    document: {
      documentElement,
      getAnimations: () => [],
    },
    MutationObserver: MutationObserverStub,
    setTimeout: null as unknown as FreezeWindow["setTimeout"],
    clearTimeout: null as unknown as FreezeWindow["clearTimeout"],
    setInterval: null as unknown as FreezeWindow["setInterval"],
    clearInterval: null as unknown as FreezeWindow["clearInterval"],
    requestAnimationFrame:
      null as unknown as FreezeWindow["requestAnimationFrame"],
    cancelAnimationFrame:
      null as unknown as FreezeWindow["cancelAnimationFrame"],
    eval(code: string) {
      // Run install script with `window`/`document`/`MutationObserver` bound to page.
      // oxlint-disable-next-line typescript/no-implied-eval -- test harness evaluates install source
      const runner = new Function(
        "window",
        "document",
        "MutationObserver",
        `${code}\n;return window;`,
      ) as (
        w: MinimalPageWindow,
        d: MinimalPageWindow["document"],
        mo: typeof MutationObserverStub,
      ) => unknown;
      return runner(page, page.document, MutationObserverStub);
    },
    __syncFreezeFromAttr() {
      // Force observer-style sync if install already ran (attr listeners fire on set).
      const value = documentElement.getAttribute(PAGE_FREEZE_ATTR);
      void value;
    },
  } as unknown as MinimalPageWindow;

  // Real timer bindings (respect vi.useFakeTimers on globalThis).
  page.setTimeout = ((handler: TimerHandler, delay = 0, ...args: unknown[]) => {
    const handle = globalThis.setTimeout(() => {
      if (typeof handler === "function") {
        handler(...args);
      }
    }, delay);
    return handle as unknown as number;
  }) as FreezeWindow["setTimeout"];
  page.clearTimeout = ((id: number | undefined) => {
    if (typeof id === "number") {
      globalThis.clearTimeout(id);
    }
  }) as FreezeWindow["clearTimeout"];
  page.setInterval = ((
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
  page.clearInterval = ((id: number | undefined) => {
    if (typeof id === "number") {
      globalThis.clearInterval(id);
    }
  }) as FreezeWindow["clearInterval"];
  page.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    globalThis.setTimeout(
      () => cb(0),
      0,
    ) as unknown as number) as FreezeWindow["requestAnimationFrame"];
  page.cancelAnimationFrame = ((id: number) => {
    globalThis.clearTimeout(id);
  }) as FreezeWindow["cancelAnimationFrame"];

  return page;
}

function installMainWorldFreezeOnPage(page: MinimalPageWindow) {
  if (page.document.documentElement.hasAttribute(PAGE_FREEZE_READY_ATTR)) {
    return;
  }
  page.eval(buildMainWorldFreezeInstallScript());
}

function flushMicrotasks() {
  // no-op placeholder for readability; attr listeners fire sync on our stub.
}

function createRealTimerWindow(): FreezeWindow {
  /** Sequential numeric ids so freeze's outstanding-timer sweep can cancel them. */
  let nextId = 1;
  const timeouts = new Map<number, ReturnType<typeof globalThis.setTimeout>>();
  const intervals = new Map<
    number,
    ReturnType<typeof globalThis.setInterval>
  >();

  const win = {} as FreezeWindow;
  win.setTimeout = ((handler: TimerHandler, delay = 0, ...args: unknown[]) => {
    const id = nextId++;
    const handle = globalThis.setTimeout(() => {
      timeouts.delete(id);
      if (typeof handler === "function") {
        handler(...args);
      }
    }, delay);
    timeouts.set(id, handle);
    return id;
  }) as FreezeWindow["setTimeout"];
  win.clearTimeout = ((id: number | undefined) => {
    if (typeof id !== "number") {
      return;
    }
    const handle = timeouts.get(id);
    if (handle !== undefined) {
      globalThis.clearTimeout(handle);
      timeouts.delete(id);
    }
  }) as FreezeWindow["clearTimeout"];
  win.setInterval = ((handler: TimerHandler, delay = 0, ...args: unknown[]) => {
    const id = nextId++;
    const handle = globalThis.setInterval(() => {
      if (typeof handler === "function") {
        handler(...args);
      }
    }, delay);
    intervals.set(id, handle);
    return id;
  }) as FreezeWindow["setInterval"];
  win.clearInterval = ((id: number | undefined) => {
    if (typeof id !== "number") {
      return;
    }
    const handle = intervals.get(id);
    if (handle !== undefined) {
      globalThis.clearInterval(handle);
      intervals.delete(id);
    }
  }) as FreezeWindow["clearInterval"];
  win.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextId++;
    const handle = globalThis.setTimeout(() => {
      timeouts.delete(id);
      cb(0);
    }, 0);
    timeouts.set(id, handle);
    return id;
  }) as FreezeWindow["requestAnimationFrame"];
  win.cancelAnimationFrame = ((id: number) => {
    win.clearTimeout(id);
  }) as FreezeWindow["cancelAnimationFrame"];
  return win;
}

type TimerHandler = (...args: unknown[]) => void;
