import type {
  WorkspaceBrowserBounds,
  WorkspaceBrowserError,
  WorkspaceBrowserState,
} from "@shared/workspace-browser";

import { useCallback, useRef } from "react";

import { cn } from "@/platform/utils";

export function WorkspaceBrowserNativeView({
  active,
  browserViewId,
  className,
  onFailure,
  onStateChange,
  url,
}: {
  active: boolean;
  browserViewId: string;
  className?: string;
  onFailure?: (error: WorkspaceBrowserError) => void;
  onStateChange?: (state: WorkspaceBrowserState) => void;
  url: string;
}) {
  const cleanupRef = useRef<() => void>(() => {});
  const propsRef = useRef({ browserViewId, onFailure, onStateChange, url });
  propsRef.current = { browserViewId, onFailure, onStateChange, url };

  const setContainer = useCallback((container: HTMLDivElement | null) => {
    cleanupRef.current();
    cleanupRef.current = () => {};

    if (!container) {
      return;
    }

    const attachmentId = crypto.randomUUID();
    let disposed = false;
    const currentProps = propsRef.current;
    const emitState = (state: WorkspaceBrowserState) => {
      propsRef.current.onStateChange?.(state);
    };
    const emitFailure = (error: WorkspaceBrowserError) => {
      propsRef.current.onFailure?.(error);
    };
    let stopTrackingBounds = () => {};
    const unsubscribe = window.workspaceBrowser.onEvent(
      currentProps.browserViewId,
      (event) => {
        emitState(event.state);
      },
    );
    void window.workspaceBrowser
      .create({
        browserViewId: currentProps.browserViewId,
        url: currentProps.url,
      })
      .then(async (state) => {
        if (disposed) {
          return;
        }
        emitState(state);
        const bounds = readWorkspaceBrowserBounds(container);
        const nextState = await window.workspaceBrowser.attach({
          attachmentId,
          bounds,
          browserViewId: currentProps.browserViewId,
        });
        return { bounds, state: nextState };
      })
      .then((result) => {
        if (!disposed && result !== undefined) {
          emitState(result.state);
          stopTrackingBounds = trackWorkspaceBrowserBounds({
            attachmentId,
            browserViewId: currentProps.browserViewId,
            container,
            initialBounds: result.bounds,
          });
        }
      })
      .catch(() => {
        // Surface a normalized failure; never forward host wire text.
        if (!disposed) {
          emitFailure({
            code: "unknown",
            url: currentProps.url,
          });
        }
      });

    cleanupRef.current = () => {
      disposed = true;
      stopTrackingBounds();
      unsubscribe();
      void window.workspaceBrowser
        .detach({
          attachmentId,
          browserViewId: currentProps.browserViewId,
        })
        .catch(() => {
          // Detach during teardown is best-effort.
        });
    };
  }, []);

  return (
    <div
      className={cn(
        "size-full min-h-0 overflow-hidden bg-background",
        className,
      )}
      ref={active ? setContainer : undefined}
    />
  );
}

function readWorkspaceBrowserBounds(container: HTMLElement) {
  const rect = readVisibleWorkspaceBrowserRect(container);

  return {
    height: Math.max(1, Math.round(rect.bottom - rect.top)),
    width: Math.max(1, Math.round(rect.right - rect.left)),
    x: Math.round(rect.left),
    y: Math.round(rect.top),
  };
}

interface WorkspaceBrowserRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function readVisibleWorkspaceBrowserRect(container: HTMLElement) {
  let rect = toWorkspaceBrowserRect(container.getBoundingClientRect());
  for (
    let ancestor = container.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    rect = clipWorkspaceBrowserRectToAncestor(rect, ancestor);
  }

  return intersectWorkspaceBrowserRects(rect, {
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
    top: 0,
  });
}

function toWorkspaceBrowserRect(rect: DOMRect): WorkspaceBrowserRect {
  return {
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    top: rect.top,
  };
}

function intersectWorkspaceBrowserRects(
  left: WorkspaceBrowserRect,
  right: WorkspaceBrowserRect,
): WorkspaceBrowserRect {
  const nextLeft = Math.max(left.left, right.left);
  const nextTop = Math.max(left.top, right.top);
  const nextRight = Math.max(nextLeft, Math.min(left.right, right.right));
  const nextBottom = Math.max(nextTop, Math.min(left.bottom, right.bottom));

  return {
    bottom: nextBottom,
    left: nextLeft,
    right: nextRight,
    top: nextTop,
  };
}

function clipWorkspaceBrowserRectToAncestor(
  rect: WorkspaceBrowserRect,
  ancestor: HTMLElement,
) {
  const ancestorRect = toWorkspaceBrowserRect(ancestor.getBoundingClientRect());
  const style = window.getComputedStyle(ancestor);
  const clipsX =
    clipsWorkspaceBrowserOverflow(style.overflowX) ||
    clipsWorkspaceBrowserOverflow(style.overflow);
  const clipsY =
    clipsWorkspaceBrowserOverflow(style.overflowY) ||
    clipsWorkspaceBrowserOverflow(style.overflow);
  const nextLeft = clipsX ? Math.max(rect.left, ancestorRect.left) : rect.left;
  const nextRight = clipsX
    ? Math.max(nextLeft, Math.min(rect.right, ancestorRect.right))
    : rect.right;
  const nextTop = clipsY ? Math.max(rect.top, ancestorRect.top) : rect.top;
  const nextBottom = clipsY
    ? Math.max(nextTop, Math.min(rect.bottom, ancestorRect.bottom))
    : rect.bottom;

  return {
    bottom: nextBottom,
    left: nextLeft,
    right: nextRight,
    top: nextTop,
  };
}

function clipsWorkspaceBrowserOverflow(value: string) {
  return (
    value === "auto" ||
    value === "clip" ||
    value === "hidden" ||
    value === "scroll"
  );
}

function trackWorkspaceBrowserBounds({
  attachmentId,
  browserViewId,
  container,
  initialBounds,
}: {
  attachmentId: string;
  browserViewId: string;
  container: HTMLElement;
  initialBounds: WorkspaceBrowserBounds;
}) {
  let animationFrame = 0;
  let disposed = false;
  let lastBounds = initialBounds;

  const tick = () => {
    if (disposed) {
      return;
    }

    const bounds = readWorkspaceBrowserBounds(container);
    if (!areWorkspaceBrowserBoundsEqual(bounds, lastBounds)) {
      lastBounds = bounds;
      void window.workspaceBrowser
        .setBounds({
          attachmentId,
          bounds,
          browserViewId,
        })
        .catch((error: unknown) => {
          console.error("Failed to update workspace browser bounds.", {
            browserViewId,
            error,
          });
        });
    }

    animationFrame = window.requestAnimationFrame(tick);
  };

  animationFrame = window.requestAnimationFrame(tick);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(animationFrame);
  };
}

function areWorkspaceBrowserBoundsEqual(
  left: WorkspaceBrowserBounds,
  right: WorkspaceBrowserBounds,
) {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}
