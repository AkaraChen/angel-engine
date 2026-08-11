/**
 * Page freeze for Design Mode annotation accuracy.
 *
 * While frozen:
 * - `setTimeout` / `setInterval` / `requestAnimationFrame` queue instead of firing
 * - running Web Animations are paused
 * - outstanding pre-freeze timer handles are cancelled (not deferred) so the
 *   page stays still for picking; only timers scheduled *during* freeze are
 *   replayed on unfreeze
 *
 * ## Main world vs preload
 *
 * Guest WebContentsView uses `contextIsolation: true`. Patching timers on the
 * preload `window` does **not** affect page scripts. Freeze must run in the
 * **page main world**.
 *
 * Control channel (no page-callable Design Mode API):
 * - Preload injects a one-shot install script via `<script>` text (main world)
 * - Preload toggles `data-angel-design-freeze` on `document.documentElement`
 * - Install script watches that attribute with MutationObserver
 *
 * Page scripts never get `window.angel*` / `exposeInMainWorld` freeze hooks.
 */

export type TimerHandler = (...args: unknown[]) => void;

/** DOM attribute toggled by preload; observed in the page main world. */
export const PAGE_FREEZE_ATTR = "data-angel-design-freeze";
/** Set once the main-world installer has run (idempotent guard). */
export const PAGE_FREEZE_READY_ATTR = "data-angel-design-freeze-ready";

export interface FreezeWindow {
  setTimeout: (
    handler: TimerHandler | string,
    delay?: number,
    ...args: unknown[]
  ) => number;
  clearTimeout: (id: number | undefined) => void;
  setInterval: (
    handler: TimerHandler | string,
    delay?: number,
    ...args: unknown[]
  ) => number;
  clearInterval: (id: number | undefined) => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  document?: {
    documentElement?: {
      getAttribute: (name: string) => string | null;
      hasAttribute: (name: string) => boolean;
      setAttribute: (name: string, value: string) => void;
      removeAttribute: (name: string) => void;
    };
    getAnimations?: () => AnimationLike[];
  };
}

export interface AnimationLike {
  playState: string;
  pause: () => void;
  play: () => void;
}

interface PendingTimeout {
  args: unknown[];
  delay: number;
  handler: TimerHandler | string;
  kind: "timeout";
}

interface PendingInterval {
  args: unknown[];
  delay: number;
  handler: TimerHandler | string;
  kind: "interval";
}

interface PendingRaf {
  callback: FrameRequestCallback;
  kind: "raf";
}

type PendingEntry = PendingTimeout | PendingInterval | PendingRaf;

export interface PageFreezer {
  freeze: () => void;
  isFrozen: () => boolean;
  unfreeze: () => void;
}

/**
 * Create a freeze controller bound to a window-like object.
 * Safe to call freeze/unfreeze multiple times (idempotent).
 *
 * Prefer main-world install via `buildMainWorldFreezeInstallScript` for the
 * guest page; this factory is the shared implementation + unit-test surface.
 */
export function createPageFreezer(win: FreezeWindow): PageFreezer {
  const originals = {
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    clearInterval: win.clearInterval.bind(win),
    clearTimeout: win.clearTimeout.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    setInterval: win.setInterval.bind(win),
    setTimeout: win.setTimeout.bind(win),
  };

  let frozen = false;
  let nextId = 1;
  const pending = new Map<number, PendingEntry>();
  const pausedAnimations: AnimationLike[] = [];

  const freeze = () => {
    if (frozen) {
      return;
    }
    frozen = true;

    // Drop timers already scheduled before freeze so annotation targets stay still.
    // Those handles are cancelled (not replayed). Documented product trade-off.
    cancelOutstandingNativeTimers(originals);

    win.setTimeout = ((
      handler: TimerHandler | string,
      delay = 0,
      ...args: unknown[]
    ) => {
      const id = nextId++;
      pending.set(id, {
        args,
        delay: normalizeDelay(delay),
        handler,
        kind: "timeout",
      });
      return id;
    }) as FreezeWindow["setTimeout"];

    win.clearTimeout = ((id: number | undefined) => {
      if (typeof id === "number") {
        pending.delete(id);
      }
    }) as FreezeWindow["clearTimeout"];

    win.setInterval = ((
      handler: TimerHandler | string,
      delay = 0,
      ...args: unknown[]
    ) => {
      const id = nextId++;
      pending.set(id, {
        args,
        delay: normalizeDelay(delay),
        handler,
        kind: "interval",
      });
      return id;
    }) as FreezeWindow["setInterval"];

    win.clearInterval = ((id: number | undefined) => {
      if (typeof id === "number") {
        pending.delete(id);
      }
    }) as FreezeWindow["clearInterval"];

    win.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, { callback, kind: "raf" });
      return id;
    }) as FreezeWindow["requestAnimationFrame"];

    win.cancelAnimationFrame = ((id: number) => {
      pending.delete(id);
    }) as FreezeWindow["cancelAnimationFrame"];

    pauseRunningAnimations();
  };

  const unfreeze = () => {
    if (!frozen) {
      return;
    }
    frozen = false;

    win.setTimeout = originals.setTimeout;
    win.clearTimeout = originals.clearTimeout;
    win.setInterval = originals.setInterval;
    win.clearInterval = originals.clearInterval;
    win.requestAnimationFrame = originals.requestAnimationFrame;
    win.cancelAnimationFrame = originals.cancelAnimationFrame;

    const entries = [...pending.entries()];
    pending.clear();

    for (const [, entry] of entries) {
      if (entry.kind === "timeout") {
        originals.setTimeout(
          entry.handler as TimerHandler,
          entry.delay,
          ...entry.args,
        );
      } else if (entry.kind === "interval") {
        originals.setInterval(
          entry.handler as TimerHandler,
          entry.delay,
          ...entry.args,
        );
      } else {
        originals.requestAnimationFrame(entry.callback);
      }
    }

    resumePausedAnimations();
  };

  function pauseRunningAnimations() {
    pausedAnimations.length = 0;
    const getAnimations = win.document?.getAnimations;
    if (typeof getAnimations !== "function") {
      return;
    }
    try {
      for (const animation of getAnimations.call(win.document)) {
        if (animation.playState === "running") {
          try {
            animation.pause();
            pausedAnimations.push(animation);
          } catch {
            // Ignore animations that refuse pause.
          }
        }
      }
    } catch {
      // document.getAnimations can throw in odd document states.
    }
  }

  function resumePausedAnimations() {
    for (const animation of pausedAnimations) {
      try {
        if (animation.playState === "paused") {
          animation.play();
        }
      } catch {
        // Ignore animations that refuse play.
      }
    }
    pausedAnimations.length = 0;
  }

  return {
    freeze,
    isFrozen: () => frozen,
    unfreeze,
  };
}

/**
 * Toggle freeze via the shared DOM attribute (works across isolated/main worlds).
 * Call from preload after ensuring the main-world installer has run.
 */
export function setPageFreezeAttribute(
  documentElement: {
    setAttribute: (name: string, value: string) => void;
    removeAttribute: (name: string) => void;
  },
  frozen: boolean,
): void {
  if (frozen) {
    documentElement.setAttribute(PAGE_FREEZE_ATTR, "1");
  } else {
    documentElement.setAttribute(PAGE_FREEZE_ATTR, "0");
  }
}

/**
 * One-shot main-world install script for guest pages.
 *
 * Inject as `<script textContent=...>` from preload (runs in page main world).
 * Idempotent via `data-angel-design-freeze-ready`. Does not expose freeze APIs
 * on `window` — only watches the freeze attribute.
 */
export function buildMainWorldFreezeInstallScript(): string {
  // Keep this body dependency-free: it is stringified into the guest page.
  return `(() => {
  const ATTR = ${JSON.stringify(PAGE_FREEZE_ATTR)};
  const READY = ${JSON.stringify(PAGE_FREEZE_READY_ATTR)};
  const root = document.documentElement;
  if (!root || root.hasAttribute(READY)) {
    return;
  }

  const originals = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  };

  let frozen = false;
  let nextId = 1;
  const pending = new Map();
  const pausedAnimations = [];

  function normalizeDelay(delay) {
    if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
      return 0;
    }
    return delay;
  }

  function cancelOutstandingNativeTimers() {
    try {
      const probe = originals.setTimeout(function () {}, 0);
      originals.clearTimeout(probe);
      const raw = typeof probe === "number" ? probe : Number(probe);
      if (!Number.isFinite(raw) || raw < 1) {
        return;
      }
      const max = Math.min(Math.floor(raw), 10000);
      for (let id = 1; id <= max; id++) {
        try { originals.clearTimeout(id); } catch (_) {}
        try { originals.clearInterval(id); } catch (_) {}
        try { originals.cancelAnimationFrame(id); } catch (_) {}
      }
    } catch (_) {}
  }

  function pauseRunningAnimations() {
    pausedAnimations.length = 0;
    if (typeof document.getAnimations !== "function") {
      return;
    }
    try {
      const list = document.getAnimations();
      for (let i = 0; i < list.length; i++) {
        const animation = list[i];
        if (animation.playState === "running") {
          try {
            animation.pause();
            pausedAnimations.push(animation);
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  function resumePausedAnimations() {
    for (let i = 0; i < pausedAnimations.length; i++) {
      const animation = pausedAnimations[i];
      try {
        if (animation.playState === "paused") {
          animation.play();
        }
      } catch (_) {}
    }
    pausedAnimations.length = 0;
  }

  function freeze() {
    if (frozen) {
      return;
    }
    frozen = true;
    cancelOutstandingNativeTimers();

    window.setTimeout = function (handler, delay) {
      const args = Array.prototype.slice.call(arguments, 2);
      const id = nextId++;
      pending.set(id, {
        kind: "timeout",
        handler: handler,
        delay: normalizeDelay(delay),
        args: args,
      });
      return id;
    };

    window.clearTimeout = function (id) {
      if (typeof id === "number") {
        pending.delete(id);
      }
    };

    window.setInterval = function (handler, delay) {
      const args = Array.prototype.slice.call(arguments, 2);
      const id = nextId++;
      pending.set(id, {
        kind: "interval",
        handler: handler,
        delay: normalizeDelay(delay),
        args: args,
      });
      return id;
    };

    window.clearInterval = function (id) {
      if (typeof id === "number") {
        pending.delete(id);
      }
    };

    window.requestAnimationFrame = function (callback) {
      const id = nextId++;
      pending.set(id, { kind: "raf", callback: callback });
      return id;
    };

    window.cancelAnimationFrame = function (id) {
      pending.delete(id);
    };

    pauseRunningAnimations();
  }

  function unfreeze() {
    if (!frozen) {
      return;
    }
    frozen = false;

    window.setTimeout = originals.setTimeout;
    window.clearTimeout = originals.clearTimeout;
    window.setInterval = originals.setInterval;
    window.clearInterval = originals.clearInterval;
    window.requestAnimationFrame = originals.requestAnimationFrame;
    window.cancelAnimationFrame = originals.cancelAnimationFrame;

    const entries = Array.from(pending.entries());
    pending.clear();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i][1];
      if (entry.kind === "timeout") {
        originals.setTimeout.apply(
          null,
          [entry.handler, entry.delay].concat(entry.args),
        );
      } else if (entry.kind === "interval") {
        originals.setInterval.apply(
          null,
          [entry.handler, entry.delay].concat(entry.args),
        );
      } else if (entry.kind === "raf") {
        originals.requestAnimationFrame(entry.callback);
      }
    }

    resumePausedAnimations();
  }

  function syncFromAttribute() {
    const value = root.getAttribute(ATTR);
    if (value === "1") {
      freeze();
    } else {
      unfreeze();
    }
  }

  const observer = new MutationObserver(function () {
    syncFromAttribute();
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: [ATTR],
  });

  root.setAttribute(READY, "1");
  syncFromAttribute();
})();`;
}

function normalizeDelay(delay: number | undefined): number {
  if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
    return 0;
  }
  return delay;
}

/**
 * Cancel native timer handles already scheduled before freeze.
 * Probe the next id, then clearTimeout/clearInterval/cancelAnimationFrame
 * for `1..probe`. Pre-freeze callbacks are dropped (not queued).
 */
function cancelOutstandingNativeTimers(originals: {
  cancelAnimationFrame: (id: number) => void;
  clearInterval: (id: number | undefined) => void;
  clearTimeout: (id: number | undefined) => void;
  setTimeout: (
    handler: TimerHandler | string,
    delay?: number,
    ...args: unknown[]
  ) => number;
}): void {
  try {
    const probe = originals.setTimeout(() => {}, 0) as number;
    originals.clearTimeout(probe);
    const raw = typeof probe === "number" ? probe : Number(probe);
    if (!Number.isFinite(raw) || raw < 1) {
      return;
    }
    // Cap sweep so hostile / test timer id spaces cannot hang the freeze path.
    const max = Math.min(Math.floor(raw), 10_000);
    for (let id = 1; id <= max; id++) {
      try {
        originals.clearTimeout(id);
      } catch {
        // ignore
      }
      try {
        originals.clearInterval(id);
      } catch {
        // ignore
      }
      try {
        originals.cancelAnimationFrame(id);
      } catch {
        // ignore
      }
    }
  } catch {
    // Timer probe can fail in constrained test doubles.
  }
}
