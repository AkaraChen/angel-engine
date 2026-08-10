import type { KeymapPlatform, ParsedBinding, ParsedSegment } from "./types";
import { parseBinding } from "./parse-binding";
import { isMacPlatform } from "./platform";

const MAC_MOD_ORDER = [
  { flag: "ctrl" as const, symbol: "⌃" },
  { flag: "alt" as const, symbol: "⌥" },
  { flag: "shift" as const, symbol: "⇧" },
  { flag: "mod" as const, symbol: "⌘" },
  { flag: "meta" as const, symbol: "⌘" },
];

const NAMED_DISPLAY: Record<string, { mac: string; other: string }> = {
  enter: { mac: "↩", other: "Enter" },
  escape: { mac: "⎋", other: "Esc" },
  tab: { mac: "⇥", other: "Tab" },
  space: { mac: "␣", other: "Space" },
  backspace: { mac: "⌫", other: "Backspace" },
  delete: { mac: "⌦", other: "Delete" },
  up: { mac: "↑", other: "Up" },
  down: { mac: "↓", other: "Down" },
  left: { mac: "←", other: "Left" },
  right: { mac: "→", other: "Right" },
  pageup: { mac: "⇞", other: "PageUp" },
  pagedown: { mac: "⇟", other: "PageDown" },
  home: { mac: "↖", other: "Home" },
  end: { mac: "↘", other: "End" },
  plus: { mac: "+", other: "+" },
};

function displayKey(key: string, platform: KeymapPlatform): string {
  const named = NAMED_DISPLAY[key];
  if (named) return isMacPlatform(platform) ? named.mac : named.other;
  if (/^f\d+$/.test(key)) return key.toUpperCase();
  return key.length === 1 ? key.toUpperCase() : key;
}

function formatSegmentMac(segment: ParsedSegment): string {
  let out = "";
  for (const { flag, symbol } of MAC_MOD_ORDER) {
    if (segment[flag]) out += symbol;
  }
  out += displayKey(segment.key, "mac");
  return out;
}

function formatSegmentOther(segment: ParsedSegment): string {
  const parts: string[] = [];
  if (segment.mod || segment.ctrl) parts.push("Ctrl");
  if (segment.alt) parts.push("Alt");
  if (segment.shift) parts.push("Shift");
  if (segment.meta) parts.push("Win");
  parts.push(displayKey(segment.key, "win"));
  return parts.join("+");
}

export function formatBinding(
  binding: ParsedBinding,
  platform: KeymapPlatform,
  _locale?: string,
): string {
  const format = isMacPlatform(platform)
    ? formatSegmentMac
    : formatSegmentOther;
  return binding.segments.map(format).join(" ");
}

export function formatBindingString(
  key: string,
  platform: KeymapPlatform,
  locale?: string,
): string | undefined {
  const parsed = parseBinding(key, platform);
  if (!parsed.ok) return undefined;
  return formatBinding(parsed.value, platform, locale);
}
