export interface ShepherdSourceCardParts {
  body: string;
  header: string;
}

/**
 * Shepherd auto-turns start with a fixed emoji header from the daemon prompt
 * builder. Detect that so the transcript can render a collapsible source card.
 */
export function parseShepherdSourceCard(
  text: string,
): ShepherdSourceCardParts | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("🐑 Shepherd round ")) return null;
  const newline = trimmed.indexOf("\n");
  if (newline < 0) {
    return { body: "", header: trimmed.trimEnd() };
  }
  return {
    body: trimmed.slice(newline + 1).trim(),
    header: trimmed.slice(0, newline).trimEnd(),
  };
}
