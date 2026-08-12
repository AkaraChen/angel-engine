import type {
  DesignAnchor,
  DesignChange,
  DesignElement,
  DesignRect,
} from "./workspace-browser";

export interface DesignPromptViewport {
  height: number;
  width: number;
}

export interface FormatDesignPromptInput {
  /** Page URL from trusted host state (webContents), not guest-reported. */
  url: string;
  viewport: DesignPromptViewport;
  anchor: DesignAnchor;
  element?: DesignElement;
  changes?: DesignChange[];
  /** User instruction, e.g. "make this primary". */
  userText: string;
}

/**
 * Build the text half of a Design Mode → agent message.
 * Attachments (viewport + crop + user files) are assembled separately.
 */
export function formatDesignPromptText(input: FormatDesignPromptInput): string {
  const sections: string[] = [];
  const instruction = input.userText.trim();
  if (instruction.length > 0) {
    sections.push(instruction);
  }

  sections.push("Design Mode selection");
  sections.push(`URL: ${input.url}`);
  sections.push(
    `Viewport: ${Math.round(input.viewport.width)}×${Math.round(input.viewport.height)}`,
  );
  sections.push(`Target: ${formatTargetLine(input.anchor, input.element)}`);

  if (input.element) {
    sections.push(...formatElementLines(input.element));
  } else if (input.anchor.kind === "region") {
    sections.push(`Region: ${formatRect(input.anchor.rect)}`);
  }

  if (input.changes && input.changes.length > 0) {
    sections.push("Requested design changes:");
    for (const change of input.changes) {
      sections.push(`- ${change.property}: ${change.value}`);
    }
  }

  return sections.join("\n");
}

function formatTargetLine(
  anchor: DesignAnchor,
  element: DesignElement | undefined,
): string {
  if (anchor.kind === "element") {
    const selector = element?.selector ?? anchor.selector;
    const tag = element?.tagName ? element.tagName.toLowerCase() : "element";
    return `${tag} ${selector} @ ${formatRect(anchor.rect)}`;
  }
  if (anchor.kind === "region") {
    return `region @ ${formatRect(anchor.rect)}`;
  }
  if (anchor.kind === "text") {
    return `text @ ${formatRect(anchor.rect)}`;
  }
  return `point (${Math.round(anchor.x)}, ${Math.round(anchor.y)})`;
}

function formatElementLines(element: DesignElement): string[] {
  const lines: string[] = [];
  lines.push(`Element selector: ${element.selector}`);
  lines.push(`Element tag: ${element.tagName.toLowerCase()}`);

  if (element.reactComponents && element.reactComponents.length > 0) {
    lines.push(
      `React components: ${element.reactComponents.map((name) => `<${name}>`).join(" ")}`,
    );
  }
  if (element.text) {
    lines.push(`Element text: ${element.text}`);
  }
  if (element.role) {
    lines.push(`role: ${element.role}`);
  }
  if (element.label) {
    lines.push(`label: ${element.label}`);
  }
  if (element.testId) {
    lines.push(`testId: ${element.testId}`);
  }
  if (element.href) {
    lines.push(`href: ${element.href}`);
  }
  if (element.attributes && Object.keys(element.attributes).length > 0) {
    lines.push(`attributes: ${formatRecord(element.attributes)}`);
  }
  if (element.parents && element.parents.length > 0) {
    lines.push(
      `Parents: ${element.parents
        .map((parent) => {
          const react =
            parent.reactComponents && parent.reactComponents.length > 0
              ? ` [${parent.reactComponents.map((name) => `<${name}>`).join(" ")}]`
              : "";
          return `${parent.tagName.toLowerCase()}${parent.selector ? ` ${parent.selector}` : ""}${react}`;
        })
        .join(" → ")}`,
    );
  }
  if (
    element.computedStyles &&
    Object.keys(element.computedStyles).length > 0
  ) {
    lines.push("Computed styles:");
    for (const [property, value] of Object.entries(element.computedStyles)) {
      lines.push(`  ${property}: ${value}`);
    }
  }
  return lines;
}

function formatRect(rect: DesignRect): string {
  return `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}×${Math.round(rect.height)}`;
}

function formatRecord(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
}
