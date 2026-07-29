import { useEffect } from "react";

/**
 * Desktop windows stay hidden until this signal fires (see
 * main/windows/content-ready.ts). Render `DesktopWindowContentReady` from the
 * places that paint real UI — never above a `Suspense` fallback or a provider
 * that renders `null` while it boots, or the window is revealed empty.
 */
let notified = false;

function notifyDesktopWindowContentReady() {
  if (notified) return;
  notified = true;

  // One frame commits the DOM, the next runs after the compositor has painted
  // it — only then does the window have something to show.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.desktopWindow.notifyContentReady();
    });
  });
}

export function DesktopWindowContentReady() {
  useEffect(notifyDesktopWindowContentReady, []);

  return null;
}
