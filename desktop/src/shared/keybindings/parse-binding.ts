import type {
  BindingParseError,
  KeymapPlatform,
  ParsedBinding,
  ParsedSegment,
} from "./types";
import { isMacPlatform } from "./platform";

const NAMED_KEYS = new Set([
  "enter",
  "escape",
  "tab",
  "space",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
  "plus",
  ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `numpad${i}`),
  "numpadadd",
  "numpadsubtract",
  "numpadmultiply",
  "numpaddivide",
  "numpaddecimal",
  "numpadenter",
]);

const LETTERS = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
const DIGITS = new Set("0123456789".split(""));
const PUNCT = new Set(["`", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/"]);

const SHIFTED_GLYPHS: Record<string, string> = {
  "?": "shift+/",
  ":": "shift+;",
  '"': "shift+'",
  "<": "shift+,",
  ">": "shift+.",
  "~": "shift+`",
  _: "shift+-",
  "|": "shift+\\",
  "+": "plus",
  "!": "shift+1",
  "@": "shift+2",
  "#": "shift+3",
  $: "shift+4",
  "%": "shift+5",
  "^": "shift+6",
  "&": "shift+7",
  "*": "shift+8",
  "(": "shift+9",
  ")": "shift+0",
  "{": "shift+[",
  "}": "shift+]",
};

const MODIFIER_ORDER = ["mod", "ctrl", "alt", "shift", "meta"] as const;

function isKeyToken(token: string): boolean {
  return (
    LETTERS.has(token) ||
    DIGITS.has(token) ||
    PUNCT.has(token) ||
    NAMED_KEYS.has(token)
  );
}

function fail(
  code: BindingParseError["code"],
  message: string,
  suggestion?: string,
): { ok: false; error: BindingParseError } {
  return { ok: false, error: { code, message, suggestion } };
}

function parseSegment(
  raw: string,
  platform: KeymapPlatform,
):
  | { ok: true; value: ParsedSegment }
  | { ok: false; error: BindingParseError } {
  const parts = raw
    .trim()
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return fail("empty-segment", "Empty key segment.");
  }

  const segment: ParsedSegment = {
    mod: false,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: "",
  };

  let key: string | undefined;

  for (const part of parts) {
    if (part in SHIFTED_GLYPHS) {
      return fail(
        "shifted-glyph",
        `Shifted glyph "${part}" is not a key token.`,
        `Write "${SHIFTED_GLYPHS[part]}" instead.`,
      );
    }

    if (part === "mod") {
      if (segment.mod) {
        return fail("duplicate-modifier", "Duplicate modifier: mod");
      }
      segment.mod = true;
      continue;
    }
    if (part === "ctrl" || part === "control") {
      if (segment.ctrl) {
        return fail("duplicate-modifier", "Duplicate modifier: ctrl");
      }
      segment.ctrl = true;
      continue;
    }
    if (part === "alt" || part === "option") {
      if (segment.alt) {
        return fail("duplicate-modifier", "Duplicate modifier: alt");
      }
      segment.alt = true;
      continue;
    }
    if (part === "shift") {
      if (segment.shift) {
        return fail("duplicate-modifier", "Duplicate modifier: shift");
      }
      segment.shift = true;
      continue;
    }
    if (
      part === "meta" ||
      part === "cmd" ||
      part === "command" ||
      part === "super" ||
      part === "win"
    ) {
      if (segment.meta) {
        return fail("duplicate-modifier", "Duplicate modifier: meta");
      }
      segment.meta = true;
      continue;
    }

    if (key !== undefined) {
      return fail(
        "unknown-key",
        `Unexpected token "${part}" after key "${key}".`,
      );
    }

    if (!isKeyToken(part)) {
      return fail("unknown-key", `Unknown key token "${part}".`);
    }
    key = part;
  }

  if (key === undefined) {
    return fail("missing-key", "Binding segment is missing a key token.");
  }

  segment.key = key;

  if (segment.mod && isMacPlatform(platform) && segment.meta) {
    return fail(
      "mod-conflict",
      "mod and meta cannot both be set on macOS (both are Cmd).",
      "Use mod+… or meta+…, not both.",
    );
  }
  if (segment.mod && !isMacPlatform(platform) && segment.ctrl) {
    return fail(
      "mod-conflict",
      "mod and ctrl cannot both be set on Windows/Linux (both are Ctrl).",
      "Use mod+… or ctrl+…, not both.",
    );
  }

  return { ok: true, value: segment };
}

export function parseBinding(
  input: string,
  platform: KeymapPlatform,
):
  | { ok: true; value: ParsedBinding }
  | { ok: false; error: BindingParseError } {
  const trimmed = input.trim();
  if (!trimmed) {
    return fail("empty", "Binding string is empty.");
  }

  const segmentTexts = trimmed.split(/\s+/);
  if (segmentTexts.length > 2) {
    return fail(
      "too-many-segments",
      "Chords may have at most two segments.",
      "Example: mod+k mod+s",
    );
  }

  const segments: ParsedSegment[] = [];
  for (const text of segmentTexts) {
    const parsed = parseSegment(text, platform);
    if (!parsed.ok) return parsed;
    segments.push(parsed.value);
  }

  if (segments.length === 1) {
    return { ok: true, value: { segments: [segments[0]!] } };
  }
  return {
    ok: true,
    value: { segments: [segments[0]!, segments[1]!] },
  };
}

export function stringifyBinding(
  binding: ParsedBinding,
  _platform?: KeymapPlatform,
): string {
  return binding.segments.map(stringifySegment).join(" ");
}

export function stringifySegment(segment: ParsedSegment): string {
  const mods: string[] = [];
  for (const name of MODIFIER_ORDER) {
    if (segment[name]) mods.push(name);
  }
  return [...mods, segment.key].join("+");
}

export function segmentHasModifier(segment: ParsedSegment): boolean {
  return segment.mod || segment.ctrl || segment.alt || segment.meta;
}

export function segmentsEqual(a: ParsedSegment, b: ParsedSegment): boolean {
  return (
    a.mod === b.mod &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta &&
    a.key === b.key
  );
}

export function bindingsEqual(a: ParsedBinding, b: ParsedBinding): boolean {
  if (a.segments.length !== b.segments.length) return false;
  return a.segments.every((segment, index) =>
    segmentsEqual(segment, b.segments[index]!),
  );
}
