import type {
  DesignElement,
  DesignElementParentSummary,
  DesignOutputDetail,
  DesignRect,
} from "./workspace-browser";

/**
 * Full computed-style property list (37) for Design Mode capture.
 * Enough for layout/typography/fill without dumping every CSSOM longhand.
 */
export const DESIGN_COMPUTED_STYLE_PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-color",
  "border-style",
  "border-radius",
  "box-sizing",
  "overflow",
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "text-align",
  "background-color",
  "opacity",
  "box-shadow",
  "filter",
  "transform",
  "transition",
] as const;

/** Layout-focused subset used by the standard tier. */
export const DESIGN_STANDARD_STYLE_PROPS = [
  "display",
  "position",
  "width",
  "height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-size",
  "font-weight",
  "color",
  "background-color",
] as const;

const REACT_NOISE_EXACT = new Set([
  "Activity",
  "Anonymous",
  "Consumer",
  "Fragment",
  "ForwardRef",
  "Lazy",
  "Memo",
  "Portal",
  "Profiler",
  "Provider",
  "StrictMode",
  "Suspense",
  "Transition",
]);

const REACT_NOISE_SUFFIX =
  /(Provider|Context|Consumer|Boundary|Portal|Adapter|Container)$/;

const SENSITIVE_INPUT_TYPES = new Set(["password", "email", "tel"]);

const MAX_ATTR_VALUE_LENGTH = 120;
const MAX_TEXT_STANDARD = 80;
const MAX_TEXT_DETAILED = 200;
const PARENT_DEPTH_STANDARD = 3;
const PARENT_DEPTH_DETAILED = 6;
const REACT_FIBER_WALK_DEPTH = 30;

export function normalizeDesignOutputDetail(
  value: unknown,
): DesignOutputDetail {
  if (value === "compact" || value === "detailed" || value === "standard") {
    return value;
  }
  return "standard";
}

/**
 * Hard redaction gate: password / email / tel inputs and autocomplete tokens
 * for payment cards or one-time codes must never contribute a `value`.
 */
export function shouldOmitElementValue(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    const inputType = (element.type || "text").toLowerCase();
    if (SENSITIVE_INPUT_TYPES.has(inputType)) {
      return true;
    }
  }

  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    )
  ) {
    return false;
  }

  const autocomplete = (
    element.getAttribute("autocomplete") ??
    ("autocomplete" in element
      ? String((element as HTMLInputElement).autocomplete ?? "")
      : "")
  )
    .trim()
    .toLowerCase();

  if (!autocomplete) {
    return false;
  }

  return (
    autocomplete.includes("cc-") ||
    autocomplete.includes("one-time-code") ||
    autocomplete === "one-time-code"
  );
}

export function rectFromElement(element: Element): DesignRect {
  const rect = element.getBoundingClientRect();
  return {
    height: roundRect(rect.height),
    width: roundRect(rect.width),
    x: roundRect(rect.x),
    y: roundRect(rect.y),
  };
}

export function rectFromDomRect(rect: DOMRect | DOMRectReadOnly): DesignRect {
  return {
    height: roundRect(rect.height),
    width: roundRect(rect.width),
    x: roundRect(rect.x),
    y: roundRect(rect.y),
  };
}

/**
 * Build a short cssPath-style selector. Good for one-shot locate; not a
 * durable anchor (Tailwind hashes / list reorders will drift).
 */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function buildCssPath(element: Element, maxDepth = 5): string {
  if (element.id && isStableId(element.id)) {
    return `#${cssEscape(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (
    current &&
    current.nodeType === Node.ELEMENT_NODE &&
    parts.length < maxDepth
  ) {
    if (current === document.documentElement || current === document.body) {
      break;
    }

    if (current.id && isStableId(current.id)) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }

    let part = current.tagName.toLowerCase();
    const classes = classTokens(current).slice(0, 2);
    if (classes.length > 0) {
      part += `.${classes.map((token) => cssEscape(token)).join(".")}`;
    }

    const parentEl: Element | null = current.parentElement;
    if (parentEl) {
      const tagName = current.tagName;
      const siblings = Array.from(parentEl.children).filter(
        (child): child is Element => child.tagName === tagName,
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }

    parts.unshift(part);
    current = parentEl;
  }

  return parts.join(" > ") || element.tagName.toLowerCase();
}

/**
 * Walk React fiber keys (`__reactFiber$*` / legacy `__reactInternalInstance$*`)
 * up to 30 frames and keep user component names only.
 */
export function collectReactComponentNames(
  element: Element,
  maxDepth = REACT_FIBER_WALK_DEPTH,
): string[] {
  const fiber = readReactFiber(element);
  if (!fiber) {
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();
  let current: ReactFiberLike | null = fiber;
  let depth = 0;

  while (current && depth < maxDepth) {
    const name = fiberComponentName(current);
    if (name && !seen.has(name) && isUsefulReactComponentName(name)) {
      seen.add(name);
      names.push(name);
    }
    current = current.return ?? null;
    depth += 1;
  }

  return names;
}

export function collectComputedStyles(
  element: Element,
  detail: DesignOutputDetail,
): Record<string, string> | undefined {
  if (detail === "compact") {
    return undefined;
  }

  const props =
    detail === "detailed"
      ? DESIGN_COMPUTED_STYLE_PROPS
      : DESIGN_STANDARD_STYLE_PROPS;

  const style = window.getComputedStyle(element);
  const result: Record<string, string> = {};
  for (const prop of props) {
    const value = style.getPropertyValue(prop);
    if (value) {
      result[prop] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Collect attributes with hard value redaction for sensitive controls.
 * `value` is never present when `shouldOmitElementValue` is true.
 */
export function collectAttributes(
  element: Element,
  detail: DesignOutputDetail,
): Record<string, string> | undefined {
  if (detail !== "detailed") {
    return undefined;
  }

  const omitValue = shouldOmitElementValue(element);
  const attributes: Record<string, string> = {};

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    if (name === "style" || name.startsWith("on")) {
      continue;
    }
    if (name === "value" && omitValue) {
      continue;
    }
    attributes[attr.name] = truncate(attr.value, MAX_ATTR_VALUE_LENGTH);
  }

  // Reflect live value for non-sensitive form controls only.
  if (
    !omitValue &&
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) &&
    typeof element.value === "string" &&
    element.value.length > 0 &&
    attributes.value === undefined
  ) {
    attributes.value = truncate(element.value, MAX_ATTR_VALUE_LENGTH);
  }

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

export function collectElementText(
  element: Element,
  detail: DesignOutputDetail,
): string | undefined {
  if (detail === "compact") {
    return undefined;
  }

  if (shouldOmitElementValue(element)) {
    return undefined;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    // Prefer non-secret visible labels over live values.
    const placeholder =
      "placeholder" in element
        ? String((element as HTMLInputElement).placeholder ?? "")
        : "";
    if (placeholder.trim()) {
      return truncate(
        placeholder.trim(),
        detail === "detailed" ? MAX_TEXT_DETAILED : MAX_TEXT_STANDARD,
      );
    }
    return undefined;
  }

  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }
  return truncate(
    text,
    detail === "detailed" ? MAX_TEXT_DETAILED : MAX_TEXT_STANDARD,
  );
}

export function collectAccessibleLabel(element: Element): string | undefined {
  const aria = element.getAttribute("aria-label")?.trim();
  if (aria) {
    return truncate(aria, MAX_TEXT_STANDARD);
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter((part): part is string => Boolean(part));
    if (parts.length > 0) {
      return truncate(parts.join(" "), MAX_TEXT_STANDARD);
    }
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    if (element.id) {
      const label = document.querySelector(
        `label[for="${cssEscape(element.id)}"]`,
      );
      const text = label?.textContent?.replace(/\s+/g, " ").trim();
      if (text) {
        return truncate(text, MAX_TEXT_STANDARD);
      }
    }
  }

  if (element instanceof HTMLElement && element.title.trim()) {
    return truncate(element.title.trim(), MAX_TEXT_STANDARD);
  }

  return undefined;
}

export function captureDesignElement(
  element: Element,
  detail: DesignOutputDetail = "standard",
): DesignElement {
  const normalized = normalizeDesignOutputDetail(detail);
  const selector = buildCssPath(element);
  const rect = rectFromElement(element);
  const reactComponents = collectReactComponentNames(element);
  const tagName = element.tagName.toLowerCase();

  const base: DesignElement = {
    rect,
    selector,
    tagName,
  };

  if (reactComponents.length > 0) {
    base.reactComponents = reactComponents;
  }

  if (normalized === "compact") {
    return base;
  }

  const role = element.getAttribute("role")?.trim();
  if (role) {
    base.role = role;
  }

  const label = collectAccessibleLabel(element);
  if (label) {
    base.label = label;
  }

  const testId =
    element.getAttribute("data-testid") ?? element.getAttribute("data-test-id");
  if (testId) {
    base.testId = testId;
  }

  if (element instanceof HTMLAnchorElement && element.href) {
    base.href = element.href;
  } else {
    const href = element.getAttribute("href");
    if (href) {
      base.href = href;
    }
  }

  const text = collectElementText(element, normalized);
  if (text) {
    base.text = text;
  }

  const computedStyles = collectComputedStyles(element, normalized);
  if (computedStyles) {
    base.computedStyles = computedStyles;
  }

  const parents = collectParentSummaries(
    element,
    normalized === "detailed" ? PARENT_DEPTH_DETAILED : PARENT_DEPTH_STANDARD,
  );
  if (parents.length > 0) {
    base.parents = parents;
  }

  if (normalized === "detailed") {
    const attributes = collectAttributes(element, normalized);
    if (attributes) {
      base.attributes = attributes;
    }
  }

  return base;
}

/**
 * Approximate serialized payload size so tiers can be regression-tested.
 * Uses JSON length (UTF-16 code units ≈ bytes for ASCII CSS/selectors).
 */
export function designElementPayloadSize(element: DesignElement): number {
  return JSON.stringify(element).length;
}

// --- internals ---

interface ReactFiberLike {
  elementType?: unknown;
  return?: ReactFiberLike | null;
  type?: unknown;
}

function collectParentSummaries(
  element: Element,
  maxDepth: number,
): DesignElementParentSummary[] {
  const parents: DesignElementParentSummary[] = [];
  let current = element.parentElement;
  let depth = 0;

  while (current && depth < maxDepth) {
    if (
      current === document.documentElement ||
      current === document.body ||
      isDesignModeOverlayNode(current)
    ) {
      break;
    }

    const summary: DesignElementParentSummary = {
      selector: buildCssPath(current),
      tagName: current.tagName.toLowerCase(),
    };
    const role = current.getAttribute("role")?.trim();
    if (role) {
      summary.role = role;
    }
    const label = collectAccessibleLabel(current);
    if (label) {
      summary.label = label;
    }
    const reactComponents = collectReactComponentNames(current);
    if (reactComponents.length > 0) {
      summary.reactComponents = reactComponents;
    }
    parents.push(summary);
    current = current.parentElement;
    depth += 1;
  }

  return parents;
}

export function isDesignModeOverlayNode(node: Node | null): boolean {
  if (!(node instanceof Element)) {
    return false;
  }
  return Boolean(
    node.closest("#angel-design-mode-root") ||
      node.id === "angel-design-mode-root" ||
      node.id === "angel-design-mode-style" ||
      node.hasAttribute("data-angel-design-mode"),
  );
}

/**
 * `elementsFromPoint` with shadow-DOM piercing: when a hit target hosts a
 * shadow root, re-query inside it so nested custom elements resolve.
 */
export function deepElementsFromPoint(x: number, y: number): Element[] {
  const results: Element[] = [];
  const visit = (root: Document | ShadowRoot) => {
    const hits =
      typeof root.elementsFromPoint === "function"
        ? root.elementsFromPoint(x, y)
        : [];
    for (const hit of hits) {
      if (results.includes(hit)) {
        continue;
      }
      results.push(hit);
      if (hit.shadowRoot) {
        visit(hit.shadowRoot);
      }
    }
  };
  visit(document);
  return results;
}

export function pickTargetElementAtPoint(x: number, y: number): Element | null {
  const hits = deepElementsFromPoint(x, y);
  for (const hit of hits) {
    if (isDesignModeOverlayNode(hit)) {
      continue;
    }
    if (hit === document.documentElement || hit === document.body) {
      continue;
    }
    return hit;
  }
  return null;
}

function readReactFiber(element: Element): ReactFiberLike | null {
  const record = element as unknown as Record<string, unknown>;
  // React marks fiber keys non-enumerable — use getOwnPropertyNames.
  for (const key of Object.getOwnPropertyNames(record)) {
    if (
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$")
    ) {
      const value = record[key];
      if (value && typeof value === "object") {
        return value as ReactFiberLike;
      }
    }
  }
  return null;
}

function fiberComponentName(fiber: ReactFiberLike): string | null {
  const candidates = [fiber.elementType, fiber.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      // Host component (div, span, …) — not useful as a React name.
      continue;
    }
    if (typeof candidate === "function") {
      const fn = candidate as { displayName?: string; name?: string };
      const name = fn.displayName || fn.name;
      if (name) {
        return cleanReactName(name);
      }
    }
    if (candidate && typeof candidate === "object") {
      const obj = candidate as {
        displayName?: string;
        name?: string;
        render?: { displayName?: string; name?: string };
        type?: { displayName?: string; name?: string } | string;
      };
      if (typeof obj.displayName === "string" && obj.displayName) {
        return cleanReactName(obj.displayName);
      }
      if (typeof obj.name === "string" && obj.name) {
        return cleanReactName(obj.name);
      }
      if (obj.render) {
        const renderName = obj.render.displayName || obj.render.name;
        if (renderName) {
          return cleanReactName(renderName);
        }
      }
      if (obj.type && typeof obj.type !== "string") {
        const nested = obj.type.displayName || obj.type.name;
        if (nested) {
          return cleanReactName(nested);
        }
      }
    }
  }
  return null;
}

function cleanReactName(raw: string): string {
  return raw
    .replace(/^ForwardRef\(/, "")
    .replace(/^Memo\(/, "")
    .replace(/\)$/, "")
    .trim();
}

export function isUsefulReactComponentName(name: string): boolean {
  if (!name || name === "Anonymous") {
    return false;
  }
  if (REACT_NOISE_EXACT.has(name)) {
    return false;
  }
  if (REACT_NOISE_SUFFIX.test(name)) {
    return false;
  }
  // Drop obvious library internals / hooks-as-components.
  if (
    name.startsWith("use") &&
    name.length > 3 &&
    name[3] === name[3]?.toUpperCase()
  ) {
    return false;
  }
  if (name.startsWith("_") || name.startsWith("$")) {
    return false;
  }
  // Prefer PascalCase user components.
  if (!/^[A-Z]/.test(name)) {
    return false;
  }
  return true;
}

function classTokens(element: Element): string[] {
  const className = element.getAttribute("class") ?? "";
  return className
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        token.length < 48 &&
        !token.includes(":") &&
        !/^[a-f0-9]{8,}$/i.test(token),
    );
}

function isStableId(id: string): boolean {
  return /^[A-Za-z][\w-]*$/.test(id) && id.length < 64;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function roundRect(value: number): number {
  return Math.round(value * 100) / 100;
}
