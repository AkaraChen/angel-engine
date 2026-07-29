import type { BrowserWindow } from "electron";

import { BrowserWindow as ElectronBrowserWindow, ipcMain } from "electron";
import log from "electron-log/main";

import { DESKTOP_WINDOW_CONTENT_READY_CHANNEL } from "../../shared/desktop-window";

/**
 * Desktop windows use transparent chrome on macOS, so a window that is shown
 * before the renderer has painted is not merely empty — it is see-through.
 * Every window is therefore created hidden and revealed only once the renderer
 * reports that it painted real content (see renderer/platform/window-content-ready).
 *
 * The renderer can stall behind a slow daemon handshake, so the reveal is also
 * capped: after this deadline the window is shown regardless, because an app
 * that never appears is worse than one that appears mid-boot.
 */
const desktopWindowContentReadyTimeoutMs = 8_000;

interface PendingReveal {
  reveal: (reason: RevealReason) => void;
}

type RevealReason = "content-ready" | "load-failed" | "timeout";

const pendingReveals = new Map<number, PendingReveal>();
const contentReadyWindowIds = new Set<number>();

export function registerDesktopWindowContentReadyIpc() {
  ipcMain.on(DESKTOP_WINDOW_CONTENT_READY_CHANNEL, (event) => {
    const window = ElectronBrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return;

    pendingReveals.get(window.id)?.reveal("content-ready");
  });
}

/**
 * True once the window has been revealed. Callers that re-focus an existing
 * window must not `show()` it before that, or they undo the reveal gate.
 */
export function isDesktopWindowContentReady(window: BrowserWindow) {
  return contentReadyWindowIds.has(window.id);
}

interface ShowDesktopWindowWhenContentReadyOptions {
  /** Runs immediately before the window is shown (e.g. restoring maximized state). */
  beforeShow?: () => void;
  timeoutMs?: number;
}

export function showDesktopWindowWhenContentReady(
  window: BrowserWindow,
  {
    beforeShow,
    timeoutMs = desktopWindowContentReadyTimeoutMs,
  }: ShowDesktopWindowWhenContentReadyOptions = {},
) {
  const windowId = window.id;
  let revealed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reveal = (reason: RevealReason) => {
    if (revealed) return;
    revealed = true;
    clearTimeout(timer);
    pendingReveals.delete(windowId);

    if (window.isDestroyed()) return;

    if (reason !== "content-ready") {
      log.warn("Showing desktop window before its content was ready.", {
        reason,
      });
    }

    contentReadyWindowIds.add(windowId);
    beforeShow?.();
    window.show();
    window.focus();
  };

  timer = setTimeout(() => {
    reveal("timeout");
  }, timeoutMs);
  pendingReveals.set(windowId, { reveal });

  // A renderer that failed to load will never report content: show the window
  // so the failure is visible instead of silently swallowing the launch.
  window.webContents.on(
    "did-fail-load",
    (_event, _errorCode, _errorDescription, _url, isMainFrame) => {
      if (isMainFrame) reveal("load-failed");
    },
  );

  window.on("closed", () => {
    clearTimeout(timer);
    pendingReveals.delete(windowId);
    contentReadyWindowIds.delete(windowId);
  });
}
