import type { ScopeName } from "./types";

export interface ActiveKeymapFocus {
  /** Active scope names from the focus chain (always includes app + window). */
  scopes: ReadonlySet<ScopeName>;
  /**
   * Scope ids observed in the focus chain, keyed by scope name.
   * Used so owner-bound rules (e.g. panel owner `chat.panel`) only match when
   * that exact scope id is active — not any panel.
   */
  scopeIds: ReadonlyMap<ScopeName, ReadonlySet<string>>;
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
  const scopeIds = new Map<ScopeName, Set<string>>();
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
      const scopeName = scope as ScopeName;
      scopes.add(scopeName);
      const id = node.getAttribute("data-keymap-scope-id");
      if (id) {
        const set = scopeIds.get(scopeName) ?? new Set<string>();
        set.add(id);
        scopeIds.set(scopeName, set);
        if (nearestScopeId === null) {
          nearestScopeId = id;
        }
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
    scopeIds,
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

/**
 * Whether a binding with optional owner may run under the current focus.
 * - app / window: always once scope is active
 * - deeper scopes with owner: owner must be an active scope-id of that scope
 *   (or match the capture zone under E3)
 */
export function ruleOwnerMatchesFocus(
  scope: ScopeName,
  owner: string | undefined,
  focus: ActiveKeymapFocus,
): boolean {
  if (scope === "app" || scope === "window") {
    return true;
  }
  if (!owner) {
    // No owner → any active scope of that name is enough.
    return focus.scopes.has(scope);
  }
  // Capture zone E3: deep rules must match capture id.
  if (focus.captureZoneId) {
    return owner === focus.captureZoneId;
  }
  const ids = focus.scopeIds.get(scope);
  return ids?.has(owner) ?? false;
}
