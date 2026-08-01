import appIconUrl from "@assets/icon.iconset/icon_256x256.png";

import { DesktopWindowContentReady } from "@/platform/window-content-ready";

/**
 * Shown while a window has nothing else to paint yet — the backend handshake
 * and the suspended providers both land here. It doubles as the window's
 * content-ready signal, so the window is revealed on this screen instead of
 * waiting, invisible, for the app to finish booting.
 *
 * This is a pure open surface with no dense content on it, which is why it is
 * one of the few places the paper dot grid is allowed.
 *
 * There is no title bar during boot, so the whole surface is a drag region.
 */
export function AppLoadingScreen() {
  return (
    <div
      className="
        dot-grid flex h-svh w-full flex-col items-center justify-center gap-6
        bg-background
      "
      data-electron-drag
    >
      <DesktopWindowContentReady />
      <img alt="" className="size-20" draggable={false} src={appIconUrl} />
      <BrandSketchStroke />
    </div>
  );
}

/**
 * The brand stroke draws itself in instead of a spinner: boot is a one-shot
 * wait, so a mark that completes reads better than a loop that never does.
 */
function BrandSketchStroke() {
  return (
    <svg
      aria-hidden
      className="h-3 w-32 overflow-visible text-primary"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 120 12"
    >
      <path
        className="
          animate-[sketch-draw_0.9s_var(--ease-standard)_both]
          motion-reduce:animate-none
        "
        d="M3 7.8 C13 3.1 24 10.4 35 6.2 C48 1.3 55 8.6 67 6.8 C78 5.2 81 2.6 91 4.9 C101 7.3 108 6.7 117 3.8"
        fill="none"
        pathLength={1}
        stroke="currentColor"
        strokeDasharray={1}
        strokeLinecap="round"
        strokeWidth="3.1"
      />
    </svg>
  );
}
