/**
 * Design Mode guest preload for workspace-browser WebContentsView.
 *
 * Security invariants:
 * - No `contextBridge.exposeInMainWorld` — page scripts get zero Design Mode API.
 * - Runtime is dormant until main sends `start`; `stop` fully tears down.
 * - Sensitive form values never enter selection payloads (see design-mode-capture).
 * - Draft CSS is attribute-selector + !important only; values are re-sanitized here.
 * - Page freeze runs in the **page main world** (script injection + DOM attr),
 *   not the isolated preload window — see design-mode-freeze.ts.
 * - Stage 2 anchors: `element` (click) + `region` (drag). No text/point yet.
 */
import { ipcRenderer } from "electron";

import {
  captureDesignElement,
  normalizeDesignOutputDetail,
  pickTargetElementAtPoint,
  rectFromDomRect,
} from "../shared/design-mode-capture";
import {
  DESIGN_DRAFT_STYLE_ID,
  DESIGN_TARGET_ATTR,
  DESIGN_TARGET_ATTR_VALUE,
  buildDraftStyleSheet,
  sanitizeDesignChanges,
} from "../shared/design-mode-css";
import {
  PAGE_FREEZE_READY_ATTR,
  buildMainWorldFreezeInstallScript,
  setPageFreezeAttribute,
} from "../shared/design-mode-freeze";
import type {
  DesignChange,
  DesignGuestCommand,
  DesignGuestEvent,
  DesignOutputDetail,
} from "../shared/workspace-browser";
import {
  WORKSPACE_BROWSER_DESIGN_GUEST_COMMAND_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL,
} from "../shared/workspace-browser";

const OVERLAY_ROOT_ID = "angel-design-mode-root";
const OVERLAY_STYLE_ID = "angel-design-mode-style";
const HIGHLIGHT_ATTR = "data-angel-design-highlight";
const REGION_ATTR = "data-angel-design-region";
const LABEL_ATTR = "data-angel-design-label";
const HIT_ATTR = "data-angel-design-hit";
const DRAG_THRESHOLD_PX = 6;

let active = false;
let cleanup: (() => void) | undefined;
let outputDetail: DesignOutputDetail = "standard";
let draftChanges: DesignChange[] = [];
let targetElement: Element | null = null;

ipcRenderer.on(
  WORKSPACE_BROWSER_DESIGN_GUEST_COMMAND_CHANNEL,
  (_event, payload: unknown) => {
    const command = parseGuestCommand(payload);
    if (!command) {
      return;
    }
    if (command.type === "start") {
      if (command.outputDetail) {
        outputDetail = normalizeDesignOutputDetail(command.outputDetail);
      }
      startDesignModeRuntime();
      return;
    }
    if (command.type === "setOutputDetail") {
      outputDetail = normalizeDesignOutputDetail(command.outputDetail);
      return;
    }
    if (command.type === "setDraft") {
      if (!active) {
        return;
      }
      applyDraftChanges(command.changes);
      return;
    }
    if (command.type === "setFrozen") {
      if (!active) {
        return;
      }
      setMainWorldFrozen(command.frozen);
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
  draftChanges = [];
  targetElement = null;
  // Freeze page timers/rAF in the **main world** (not this isolated window).
  setMainWorldFrozen(true);
  cleanup = mountInteractiveOverlay();
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
  clearDraftInjection();
  clearTargetAttribute();
  draftChanges = [];
  targetElement = null;
  setMainWorldFrozen(false);
  removeOverlayNodes();
  emitGuestEvent({ type: "stopped" });
}

/**
 * Install main-world freezer once (script tag → page world), then toggle via
 * a shared DOM attribute. No `window.*` Design Mode API is exposed to page JS.
 */
function setMainWorldFrozen(frozen: boolean) {
  ensureMainWorldFreezeInstalled();
  setPageFreezeAttribute(document.documentElement, frozen);
}

function ensureMainWorldFreezeInstalled() {
  if (document.documentElement.hasAttribute(PAGE_FREEZE_READY_ATTR)) {
    return;
  }
  const script = document.createElement("script");
  script.textContent = buildMainWorldFreezeInstallScript();
  // Inline classic script runs in the page main world under contextIsolation.
  const parent = document.documentElement;
  parent.appendChild(script);
  script.remove();
}

function applyDraftChanges(changes: DesignChange[]) {
  draftChanges = sanitizeDesignChanges(changes);
  injectDraftStyleSheet(buildDraftStyleSheet(draftChanges));
}

function injectDraftStyleSheet(cssText: string) {
  let style = document.getElementById(
    DESIGN_DRAFT_STYLE_ID,
  ) as HTMLStyleElement | null;
  if (!cssText) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = DESIGN_DRAFT_STYLE_ID;
    document.documentElement.append(style);
  }
  style.textContent = cssText;
}

function clearDraftInjection() {
  document.getElementById(DESIGN_DRAFT_STYLE_ID)?.remove();
}

function markTargetElement(element: Element | null) {
  clearTargetAttribute();
  targetElement = element;
  if (element) {
    element.setAttribute(DESIGN_TARGET_ATTR, DESIGN_TARGET_ATTR_VALUE);
  }
}

function clearTargetAttribute() {
  if (targetElement?.isConnected) {
    targetElement.removeAttribute(DESIGN_TARGET_ATTR);
  }
  // Also clear any stale markers left by navigation mid-session.
  for (const node of document.querySelectorAll(
    `[${DESIGN_TARGET_ATTR}="${DESIGN_TARGET_ATTR_VALUE}"]`,
  )) {
    node.removeAttribute(DESIGN_TARGET_ATTR);
  }
  targetElement = null;
}

/**
 * Interactive overlay: full-viewport hit layer + highlight + optional region.
 * pointer-events only on the hit layer so we can track targets without
 * permanently blocking page interaction after stop (nodes are removed).
 */
function mountInteractiveOverlay(): () => void {
  removeOverlayNodes();

  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    #${OVERLAY_ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      pointer-events: none;
      font: 12px/1.2 ui-sans-serif, system-ui, sans-serif;
    }
    #${OVERLAY_ROOT_ID} [${HIT_ATTR}] {
      position: absolute;
      inset: 0;
      pointer-events: auto;
      cursor: crosshair;
      background: transparent;
    }
    #${OVERLAY_ROOT_ID} [data-angel-design-badge] {
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
      border-radius: 999px;
      padding: 4px 10px;
      color: #f8fafc;
      background: color-mix(in oklab, #0f172a 88%, transparent);
      border: 1px solid color-mix(in oklab, #38bdf8 55%, transparent);
      box-shadow: 0 6px 20px color-mix(in oklab, #020617 35%, transparent);
      letter-spacing: 0.02em;
      user-select: none;
      z-index: 2;
    }
    #${OVERLAY_ROOT_ID} [${HIGHLIGHT_ATTR}] {
      position: fixed;
      pointer-events: none;
      box-sizing: border-box;
      border: 2px solid #38bdf8;
      background: color-mix(in oklab, #38bdf8 16%, transparent);
      border-radius: 2px;
      z-index: 1;
      display: none;
    }
    #${OVERLAY_ROOT_ID} [${REGION_ATTR}] {
      position: fixed;
      pointer-events: none;
      box-sizing: border-box;
      border: 1.5px dashed #f472b6;
      background: color-mix(in oklab, #f472b6 12%, transparent);
      z-index: 1;
      display: none;
    }
    #${OVERLAY_ROOT_ID} [${LABEL_ATTR}] {
      position: fixed;
      pointer-events: none;
      z-index: 2;
      max-width: min(420px, 80vw);
      padding: 2px 6px;
      border-radius: 4px;
      color: #0f172a;
      background: #38bdf8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: none;
    }
  `;

  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.setAttribute("data-angel-design-mode", "active");

  const badge = document.createElement("div");
  badge.setAttribute("data-angel-design-badge", "");
  badge.textContent = "Design Mode · click element · drag region · page frozen";

  const hit = document.createElement("div");
  hit.setAttribute(HIT_ATTR, "");

  const highlight = document.createElement("div");
  highlight.setAttribute(HIGHLIGHT_ATTR, "");

  const regionBox = document.createElement("div");
  regionBox.setAttribute(REGION_ATTR, "");

  const label = document.createElement("div");
  label.setAttribute(LABEL_ATTR, "");

  root.append(hit, highlight, regionBox, label, badge);

  const attach = () => {
    if (!document.documentElement.contains(style)) {
      document.documentElement.append(style);
    }
    if (!document.documentElement.contains(root)) {
      document.documentElement.append(root);
    }
    // Keep draft style node attached after mutations.
    if (
      draftChanges.length > 0 &&
      !document.getElementById(DESIGN_DRAFT_STYLE_ID)
    ) {
      injectDraftStyleSheet(buildDraftStyleSheet(draftChanges));
    }
  };
  attach();

  const observer = new MutationObserver(() => {
    if (active) {
      attach();
    }
  });
  observer.observe(document.documentElement, { childList: true });

  let hoverElement: Element | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let dragging = false;

  const onPointerMove = (event: PointerEvent) => {
    if (dragging && dragStart) {
      paintRegion(
        regionBox,
        dragStart.x,
        dragStart.y,
        event.clientX,
        event.clientY,
      );
      hideBox(highlight);
      hideBox(label);
      return;
    }

    // Temporarily disable hit layer so elementsFromPoint sees the page.
    hit.style.pointerEvents = "none";
    const target = pickTargetElementAtPoint(event.clientX, event.clientY);
    hit.style.pointerEvents = "auto";

    hoverElement = target;
    if (!target) {
      hideBox(highlight);
      hideBox(label);
      return;
    }

    const rect = target.getBoundingClientRect();
    paintBox(highlight, rect);
    const names = captureDesignElement(target, "compact").reactComponents;
    const tag = target.tagName.toLowerCase();
    label.textContent =
      names && names.length > 0
        ? `${names.map((name) => `<${name}>`).join(" ")} · ${tag}`
        : tag;
    paintLabel(label, rect);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragStart = { x: event.clientX, y: event.clientY };
    dragging = false;
    hideBox(regionBox);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragStart || event.button !== 0) {
      dragStart = null;
      dragging = false;
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const distance = Math.hypot(dx, dy);

    if (dragging || distance >= DRAG_THRESHOLD_PX) {
      const rect = normalizeRegionRect(
        dragStart.x,
        dragStart.y,
        event.clientX,
        event.clientY,
      );
      if (rect.width >= 2 && rect.height >= 2) {
        // Region selections have no single target element for CSS draft.
        markTargetElement(null);
        draftChanges = [];
        clearDraftInjection();
        emitGuestEvent({
          anchor: { kind: "region", rect },
          type: "selection",
        });
      }
    } else {
      hit.style.pointerEvents = "none";
      const target =
        hoverElement ?? pickTargetElementAtPoint(event.clientX, event.clientY);
      hit.style.pointerEvents = "auto";
      if (target) {
        const element = captureDesignElement(target, outputDetail);
        // Reset draft on each pick so the inspector matches the new element.
        draftChanges = [];
        clearDraftInjection();
        markTargetElement(target);
        emitGuestEvent({
          anchor: {
            kind: "element",
            rect: element.rect,
            selector: element.selector,
          },
          element,
          type: "selection",
        });
        paintBox(highlight, target.getBoundingClientRect());
      }
    }

    dragStart = null;
    dragging = false;
    hideBox(regionBox);
  };

  const onPointerMoveDrag = (event: PointerEvent) => {
    if (!dragStart) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - dragStart.x,
      event.clientY - dragStart.y,
    );
    if (distance >= DRAG_THRESHOLD_PX) {
      dragging = true;
    }
  };

  const onClick = (event: MouseEvent) => {
    // Block page clicks while Design Mode is active.
    event.preventDefault();
    event.stopPropagation();
  };

  hit.addEventListener("pointermove", onPointerMove, true);
  hit.addEventListener("pointerdown", onPointerDown, true);
  hit.addEventListener("pointerup", onPointerUp, true);
  hit.addEventListener("pointermove", onPointerMoveDrag, true);
  hit.addEventListener("click", onClick, true);
  hit.addEventListener("auxclick", onClick, true);

  return () => {
    observer.disconnect();
    hit.removeEventListener("pointermove", onPointerMove, true);
    hit.removeEventListener("pointerdown", onPointerDown, true);
    hit.removeEventListener("pointerup", onPointerUp, true);
    hit.removeEventListener("pointermove", onPointerMoveDrag, true);
    hit.removeEventListener("click", onClick, true);
    hit.removeEventListener("auxclick", onClick, true);
    removeOverlayNodes();
  };
}

function paintBox(box: HTMLElement, rect: DOMRect | DOMRectReadOnly) {
  box.style.display = "block";
  box.style.left = `${rect.x}px`;
  box.style.top = `${rect.y}px`;
  box.style.width = `${Math.max(rect.width, 1)}px`;
  box.style.height = `${Math.max(rect.height, 1)}px`;
}

function paintLabel(label: HTMLElement, rect: DOMRect | DOMRectReadOnly) {
  label.style.display = "block";
  const top = Math.max(0, rect.y - 20);
  label.style.left = `${Math.max(0, rect.x)}px`;
  label.style.top = `${top}px`;
}

function paintRegion(
  box: HTMLElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  box.style.display = "block";
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
}

function hideBox(box: HTMLElement) {
  box.style.display = "none";
}

function normalizeRegionRect(x1: number, y1: number, x2: number, y2: number) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return rectFromDomRect(
    DOMRect.fromRect
      ? DOMRect.fromRect({ x: left, y: top, width, height })
      : ({
          x: left,
          y: top,
          width,
          height,
          top,
          left,
          right: left + width,
          bottom: top + height,
          toJSON() {
            return this;
          },
        } as DOMRect),
  );
}

function removeOverlayNodes() {
  document.getElementById(OVERLAY_ROOT_ID)?.remove();
  document.getElementById(OVERLAY_STYLE_ID)?.remove();
}

function emitGuestEvent(event: DesignGuestEvent) {
  ipcRenderer.send(WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL, event);
}

function parseGuestCommand(payload: unknown): DesignGuestCommand | null {
  if (typeof payload !== "object" || payload === null || !("type" in payload)) {
    return null;
  }
  const type = (payload as { type?: unknown }).type;
  if (type === "stop") {
    return { type: "stop" };
  }
  if (type === "start") {
    const detail = (payload as { outputDetail?: unknown }).outputDetail;
    return {
      type: "start",
      outputDetail: detail ? normalizeDesignOutputDetail(detail) : undefined,
    };
  }
  if (type === "setOutputDetail") {
    const detail = (payload as { outputDetail?: unknown }).outputDetail;
    if (detail === undefined) {
      return null;
    }
    return {
      type: "setOutputDetail",
      outputDetail: normalizeDesignOutputDetail(detail),
    };
  }
  if (type === "setDraft") {
    const changes = (payload as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) {
      return null;
    }
    const parsed: DesignChange[] = [];
    for (const entry of changes) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { property?: unknown }).property === "string" &&
        typeof (entry as { value?: unknown }).value === "string"
      ) {
        parsed.push({
          property: (entry as DesignChange).property,
          value: (entry as DesignChange).value,
        });
      }
    }
    return { type: "setDraft", changes: parsed };
  }
  if (type === "setFrozen") {
    const frozen = (payload as { frozen?: unknown }).frozen;
    if (typeof frozen !== "boolean") {
      return null;
    }
    return { type: "setFrozen", frozen };
  }
  return null;
}
