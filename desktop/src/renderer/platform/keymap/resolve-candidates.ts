import type { KeymapPlatform, ParsedSegment } from "@shared/keybindings";

const CODE_TO_TOKEN: Record<string, string> = {
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => {
      const letter = String.fromCharCode(97 + i);
      return [`Key${letter.toUpperCase()}`, letter];
    }),
  ),
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`Digit${i}`, String(i)]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`Numpad${i}`, `numpad${i}`]),
  ),
  NumpadAdd: "numpadadd",
  NumpadSubtract: "numpadsubtract",
  NumpadMultiply: "numpadmultiply",
  NumpadDivide: "numpaddivide",
  NumpadDecimal: "numpaddecimal",
  NumpadEnter: "numpadenter",
  Enter: "enter",
  Escape: "escape",
  Tab: "tab",
  Space: "space",
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  ...Object.fromEntries(
    Array.from({ length: 24 }, (_, i) => [`F${i + 1}`, `f${i + 1}`]),
  ),
};

const KEY_TOKENS = new Set(Object.values(CODE_TO_TOKEN));

export type ResolveKeyboardEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "code"
  | "ctrlKey"
  | "isComposing"
  | "key"
  | "keyCode"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>;

export function resolveCandidates(
  event: ResolveKeyboardEvent,
  platform: KeymapPlatform,
): ParsedSegment[] {
  if (event.isComposing || event.keyCode === 229) {
    return [];
  }

  const isMac = platform === "mac";
  // mod consumes the platform primary modifier bit
  const mods: Omit<ParsedSegment, "key"> = isMac
    ? {
        mod: event.metaKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: false,
      }
    : {
        mod: event.ctrlKey,
        ctrl: false,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      };

  const codeToken = CODE_TO_TOKEN[event.code];
  const candidates: ParsedSegment[] = [];

  if (codeToken) {
    candidates.push({ ...mods, key: codeToken });
  }

  const altGr = !isMac && event.ctrlKey && event.altKey;
  if (!altGr && event.key.length === 1) {
    const keyToken = event.key.toLowerCase();
    if (KEY_TOKENS.has(keyToken) && keyToken !== codeToken) {
      candidates.push({ ...mods, key: keyToken });
    }
  }

  if (event.key === "Dead" && candidates.length === 0) {
    return [];
  }

  return candidates;
}
