import type { DesignChange } from "./workspace-browser";

/**
 * Attribute marker on the active design target element.
 * Guest injects draft CSS via this selector + `!important`.
 */
export const DESIGN_TARGET_ATTR = "data-angel-design-target";
export const DESIGN_TARGET_ATTR_VALUE = "active";
export const DESIGN_DRAFT_STYLE_ID = "angel-design-draft-style";

export type DesignCssFieldGroupId =
  | "position"
  | "layout"
  | "dimensions"
  | "spacing"
  | "typography"
  | "fill"
  | "stroke"
  | "effects";

export interface DesignCssField {
  /** CSS property name (kebab-case). */
  property: string;
  /** Short label for the inspector. */
  label: string;
  /** Optional placeholder hint. */
  placeholder?: string;
}

export interface DesignCssFieldGroup {
  id: DesignCssFieldGroupId;
  label: string;
  fields: DesignCssField[];
}

/**
 * Figma-style inspector groups. Mirrors cradle's design-field shape without
 * the layout/wireframe placement surface (out of scope for F04-4).
 */
export const DESIGN_CSS_FIELD_GROUPS: readonly DesignCssFieldGroup[] = [
  {
    id: "position",
    label: "Position",
    fields: [
      { property: "position", label: "Position", placeholder: "relative" },
      { property: "top", label: "Top", placeholder: "0" },
      { property: "right", label: "Right", placeholder: "0" },
      { property: "bottom", label: "Bottom", placeholder: "0" },
      { property: "left", label: "Left", placeholder: "0" },
      { property: "z-index", label: "Z", placeholder: "0" },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    fields: [
      { property: "display", label: "Display", placeholder: "flex" },
      {
        property: "flex-direction",
        label: "Direction",
        placeholder: "row",
      },
      {
        property: "justify-content",
        label: "Justify",
        placeholder: "flex-start",
      },
      { property: "align-items", label: "Align", placeholder: "stretch" },
      { property: "gap", label: "Gap", placeholder: "8px" },
      { property: "overflow", label: "Overflow", placeholder: "visible" },
      { property: "box-sizing", label: "Box", placeholder: "border-box" },
    ],
  },
  {
    id: "dimensions",
    label: "Dimensions",
    fields: [
      { property: "width", label: "W", placeholder: "auto" },
      { property: "height", label: "H", placeholder: "auto" },
      { property: "min-width", label: "Min W", placeholder: "0" },
      { property: "min-height", label: "Min H", placeholder: "0" },
      { property: "max-width", label: "Max W", placeholder: "none" },
      { property: "max-height", label: "Max H", placeholder: "none" },
    ],
  },
  {
    id: "spacing",
    label: "Spacing",
    fields: [
      { property: "margin-top", label: "MT", placeholder: "0" },
      { property: "margin-right", label: "MR", placeholder: "0" },
      { property: "margin-bottom", label: "MB", placeholder: "0" },
      { property: "margin-left", label: "ML", placeholder: "0" },
      { property: "padding-top", label: "PT", placeholder: "0" },
      { property: "padding-right", label: "PR", placeholder: "0" },
      { property: "padding-bottom", label: "PB", placeholder: "0" },
      { property: "padding-left", label: "PL", placeholder: "0" },
    ],
  },
  {
    id: "typography",
    label: "Typography",
    fields: [
      { property: "font-family", label: "Family", placeholder: "system-ui" },
      { property: "font-size", label: "Size", placeholder: "16px" },
      { property: "font-weight", label: "Weight", placeholder: "400" },
      { property: "line-height", label: "LH", placeholder: "1.5" },
      { property: "color", label: "Color", placeholder: "#111" },
      { property: "text-align", label: "Align", placeholder: "left" },
    ],
  },
  {
    id: "fill",
    label: "Fill",
    fields: [
      {
        property: "background-color",
        label: "Fill",
        placeholder: "transparent",
      },
      { property: "opacity", label: "Opacity", placeholder: "1" },
    ],
  },
  {
    id: "stroke",
    label: "Stroke",
    fields: [
      {
        property: "border-top-width",
        label: "BT",
        placeholder: "0",
      },
      {
        property: "border-right-width",
        label: "BR",
        placeholder: "0",
      },
      {
        property: "border-bottom-width",
        label: "BB",
        placeholder: "0",
      },
      {
        property: "border-left-width",
        label: "BL",
        placeholder: "0",
      },
      {
        property: "border-color",
        label: "Color",
        placeholder: "currentColor",
      },
      {
        property: "border-style",
        label: "Style",
        placeholder: "solid",
      },
      {
        property: "border-radius",
        label: "Radius",
        placeholder: "0",
      },
    ],
  },
  {
    id: "effects",
    label: "Effects",
    fields: [
      {
        property: "box-shadow",
        label: "Shadow",
        placeholder: "none",
      },
      {
        property: "filter",
        label: "Filter",
        placeholder: "none",
      },
      {
        property: "transform",
        label: "Transform",
        placeholder: "none",
      },
      {
        property: "transition",
        label: "Transition",
        placeholder: "none",
      },
    ],
  },
] as const;

const ALLOWED_CSS_PROPERTIES = new Set(
  DESIGN_CSS_FIELD_GROUPS.flatMap((group) =>
    group.fields.map((field) => field.property),
  ),
);

/** CSS property name pattern: kebab-case identifiers only. */
const CSS_PROPERTY_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Reject values that can pull remote content or break out of a declaration.
 *
 * cradle only strips `;{}`; angel additionally blocks `url(`, `expression(`,
 * and `@import` so draft preview cannot fetch remote resources.
 */
export function isUnsafeCssValue(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("url(") ||
    lower.includes("expression(") ||
    lower.includes("@import")
  );
}

/**
 * Sanitize a single CSS property name for draft injection.
 * Only allowlisted inspector properties are accepted.
 */
export function sanitizeCssProperty(property: string): string | null {
  const trimmed = property.trim().toLowerCase();
  if (!CSS_PROPERTY_PATTERN.test(trimmed)) {
    return null;
  }
  if (!ALLOWED_CSS_PROPERTIES.has(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Sanitize a CSS declaration value for draft injection.
 * Returns `null` when empty or unsafe.
 */
export function sanitizeCssValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (isUnsafeCssValue(trimmed)) {
    return null;
  }
  // Strip characters that can terminate / nest declarations.
  const cleaned = trimmed.replace(/[;{}]/g, "").trim();
  if (!cleaned) {
    return null;
  }
  if (isUnsafeCssValue(cleaned)) {
    return null;
  }
  return cleaned;
}

export interface SanitizedDesignChange {
  property: string;
  value: string;
}

/**
 * Filter + sanitize a list of draft changes for injection and prompt text.
 * Invalid / unsafe entries are dropped (not coerced).
 */
export function sanitizeDesignChanges(
  changes: readonly DesignChange[],
): SanitizedDesignChange[] {
  const byProperty = new Map<string, string>();
  for (const change of changes) {
    const property = sanitizeCssProperty(change.property);
    const value = sanitizeCssValue(change.value);
    if (!property || !value) {
      continue;
    }
    byProperty.set(property, value);
  }
  return [...byProperty.entries()].map(([property, value]) => ({
    property,
    value,
  }));
}

/**
 * Build the draft stylesheet text injected into the guest page.
 *
 * ```
 * [data-angel-design-target="active"] { color: red !important; }
 * ```
 */
export function buildDraftStyleSheet(changes: readonly DesignChange[]): string {
  const sanitized = sanitizeDesignChanges(changes);
  if (sanitized.length === 0) {
    return "";
  }
  const declarations = sanitized
    .map(({ property, value }) => `${property}: ${value} !important;`)
    .join(" ");
  return `[${DESIGN_TARGET_ATTR}="${DESIGN_TARGET_ATTR_VALUE}"] { ${declarations} }`;
}

/**
 * Merge a property edit into an existing draft list.
 * Empty `value` removes the property from the draft.
 * Returns `null` for the change when the value is non-empty but unsafe/invalid
 * (caller should keep previous draft and surface an error).
 */
export function applyDesignChangeEdit(
  current: readonly DesignChange[],
  property: string,
  value: string,
): { changes: DesignChange[]; rejected: boolean } {
  const prop = sanitizeCssProperty(property);
  if (!prop) {
    return { changes: [...current], rejected: true };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      changes: current.filter((change) => change.property !== prop),
      rejected: false,
    };
  }

  const safe = sanitizeCssValue(trimmed);
  if (!safe) {
    return { changes: [...current], rejected: true };
  }

  const without = current.filter((change) => change.property !== prop);
  return {
    changes: [...without, { property: prop, value: safe }],
    rejected: false,
  };
}

export function isAllowedDesignCssProperty(property: string): boolean {
  return ALLOWED_CSS_PROPERTIES.has(property.trim().toLowerCase());
}
