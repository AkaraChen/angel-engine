/**
 * Design Mode guest preload for workspace-browser WebContentsView.
 *
 * Security invariants (KIT-840):
 * - No `contextBridge.exposeInMainWorld` — page scripts get zero Design Mode API.
 * - Runtime is dormant until main sends `start`; `stop` fully tears down.
 * - Selection / screenshot / send are intentionally absent in stage 1.
 */
import { ipcRenderer } from "electron";

import type {
  DesignGuestCommand,
  DesignGuestEvent,
} from "../shared/workspace-browser";
import {
  WORKSPACE_BROWSER_DESIGN_GUEST_COMMAND_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL,
} from "../shared/workspace-browser";

const OVERLAY_ROOT_ID = "angel-design-mode-root";
const OVERLAY_STYLE_ID = "angel-design-mode-style";

let active = false;
let cleanup: (() => void) | undefined;

ipcRenderer.on(
  WORKSPACE_BROWSER_DESIGN_GUEST_COMMAND_CHANNEL,
  (_event, payload: unknown) => {
    const command = parseGuestCommand(payload);
    if (!command) {
      return;
    }
    if (command.type === "start") {
      startDesignModeRuntime();
      return;
    }
    stopDesignModeRuntime();
  },
);

function startDesignModeRuntime() {
  if (active) {
    return;
  }
  active = true;
  cleanup = mountDormantOverlay();
  emitGuestEvent({ type: "started" });
}

function stopDesignModeRuntime() {
  if (!active && !cleanup) {
    emitGuestEvent({ type: "stopped" });
    return;
  }
  active = false;
  cleanup?.();
  cleanup = undefined;
  // Defensive second pass in case navigation left orphaned nodes.
  removeOverlayNodes();
  emitGuestEvent({ type: "stopped" });
}

/**
 * Stage 1 overlay: a non-interactive top rail marker only.
 * No pointer capture, no element pick, no page API.
 */
function mountDormantOverlay(): () => void {
  removeOverlayNodes();

  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    #${OVERLAY_ROOT_ID} {
      position: fixed;
      inset: 0 0 auto 0;
      z-index: 2147483646;
      pointer-events: none;
      display: flex;
      justify-content: center;
      padding-top: 8px;
      font: 12px/1.2 ui-sans-serif, system-ui, sans-serif;
    }
    #${OVERLAY_ROOT_ID} [data-angel-design-badge] {
      pointer-events: none;
      border-radius: 999px;
      padding: 4px 10px;
      color: #f8fafc;
      background: color-mix(in oklab, #0f172a 88%, transparent);
      border: 1px solid color-mix(in oklab, #38bdf8 55%, transparent);
      box-shadow: 0 6px 20px color-mix(in oklab, #020617 35%, transparent);
      letter-spacing: 0.02em;
      user-select: none;
    }
  `;

  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.setAttribute("data-angel-design-mode", "active");
  root.setAttribute("aria-hidden", "true");

  const badge = document.createElement("div");
  badge.setAttribute("data-angel-design-badge", "");
  badge.textContent = "Design Mode";
  root.append(badge);

  const attach = () => {
    if (!document.documentElement.contains(style)) {
      document.documentElement.append(style);
    }
    if (!document.documentElement.contains(root)) {
      document.documentElement.append(root);
    }
  };

  attach();

  // Re-attach if the page wipes the document (soft navigations / frameworks).
  const observer = new MutationObserver(() => {
    if (active) {
      attach();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
  });

  return () => {
    observer.disconnect();
    removeOverlayNodes();
  };
}

function removeOverlayNodes() {
  document.getElementById(OVERLAY_ROOT_ID)?.remove();
  document.getElementById(OVERLAY_STYLE_ID)?.remove();
}

function emitGuestEvent(event: DesignGuestEvent) {
  ipcRenderer.send(WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL, event);
}

function parseGuestCommand(payload: unknown): DesignGuestCommand | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    (payload.type === "start" || payload.type === "stop")
  ) {
    return { type: payload.type };
  }
  return null;
}
