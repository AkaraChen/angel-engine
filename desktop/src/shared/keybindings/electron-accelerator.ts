import type { KeymapPlatform, ParsedBinding } from "./types";
import { parseBinding } from "./parse-binding";

const KEY_TO_ACCELERATOR: Record<string, string> = {
  enter: "Enter",
  escape: "Escape",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
  plus: "Plus",
  ",": ",",
  ".": ".",
  "/": "/",
  "\\": "\\",
  ";": ";",
  "'": "'",
  "[": "[",
  "]": "]",
  "-": "-",
  "=": "=",
  "`": "`",
};

/**
 * Convert a canonical binding to an Electron accelerator string.
 * Chords cannot be represented → undefined (menu item stays clickable without shortcut).
 */
export function toElectronAccelerator(
  key: string,
  platform: KeymapPlatform,
): string | undefined {
  const parsed = parseBinding(key, platform);
  if (!parsed.ok) return undefined;
  return parsedBindingToElectronAccelerator(parsed.value, platform);
}

export function parsedBindingToElectronAccelerator(
  binding: ParsedBinding,
  platform: KeymapPlatform,
): string | undefined {
  if (binding.segments.length !== 1) return undefined;
  const segment = binding.segments[0]!;
  const parts: string[] = [];

  if (segment.mod) {
    parts.push("CmdOrCtrl");
  } else {
    if (segment.ctrl) parts.push("Ctrl");
    if (segment.meta) {
      parts.push(platform === "mac" ? "Cmd" : "Super");
    }
  }
  if (segment.alt) parts.push("Alt");
  if (segment.shift) parts.push("Shift");

  const key =
    KEY_TO_ACCELERATOR[segment.key] ??
    (/^[a-z0-9]$/i.test(segment.key)
      ? segment.key.toUpperCase()
      : /^f\d+$/i.test(segment.key)
        ? segment.key.toUpperCase()
        : undefined);
  if (!key) return undefined;
  parts.push(key);
  return parts.join("+");
}
