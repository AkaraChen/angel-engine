/**
 * Page freeze for Design Mode annotation accuracy.
 *
 * While frozen:
 * - `setTimeout` / `setInterval` / `requestAnimationFrame` queue instead of firing
 * - running Web Animations are paused
 *
 * On unfreeze, originals are restored, queued timers are re-scheduled with
 * remaining delay, and paused animations are played again.
 */

export type TimerHandler = (...args: unknown[]) => void;

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

function normalizeDelay(delay: number | undefined): number {
  if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
    return 0;
  }
  return delay;
}
