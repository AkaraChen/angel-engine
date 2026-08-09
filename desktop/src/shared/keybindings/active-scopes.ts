import type { ScopeName } from "./types";

export interface ActiveKeymapFocus {
  /** Active scope names from the focus chain (always includes app + window). */
  scopes: ReadonlySet<ScopeName>;
  /** Capture zone id if focus is inside data-keymap-capture. */
  captureZoneId: string | null;
  /** Nearest data-keymap-scope-id walking up from focus. */
  nearestScopeId: string | null;
  focusEditable: boolean;
}

const SCOPE_NAMES: ReadonlySet<string> = new Set([
  "app",
  "window",
  "view",
  "panel",
  "editable",
]);

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Resolve the active keymap scope chain from the event target / activeElement
 * (KIT-796 §3.1): walk up DOM for data-keymap-scope markers.
 */
export function resolveActiveKeymapFocus(
  target: EventTarget | null,
): ActiveKeymapFocus {
  const scopes = new Set<ScopeName>(["app", "window"]);
  let captureZoneId: string | null = null;
  let nearestScopeId: string | null = null;

  const focusEditable = isEditableElement(target);
  if (focusEditable) {
    scopes.add("editable");
  }

  let node: Element | null =
    target instanceof Element
      ? target
      : typeof document !== "undefined"
        ? document.activeElement
        : null;

  while (node) {
    const scope = node.getAttribute("data-keymap-scope");
    if (scope && SCOPE_NAMES.has(scope)) {
      scopes.add(scope as ScopeName);
      if (nearestScopeId === null) {
        nearestScopeId = node.getAttribute("data-keymap-scope-id");
      }
    }
    const capture = node.getAttribute("data-keymap-capture");
    if (capture && captureZoneId === null) {
      captureZoneId = capture;
    }
    node = node.parentElement;
  }

  return {
    scopes,
    captureZoneId,
    nearestScopeId,
    focusEditable,
  };
}

export function scopeIsActive(
  scope: ScopeName,
  active: ReadonlySet<ScopeName>,
): boolean {
  return active.has(scope);
}
