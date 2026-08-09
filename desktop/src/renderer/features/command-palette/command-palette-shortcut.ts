type CommandPaletteKeyboardEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "ctrlKey"
  | "defaultPrevented"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>;

export function isCommandPaletteShortcut(
  event: CommandPaletteKeyboardEvent,
  platform: DesktopPlatform,
) {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    event.key.toLowerCase() !== "k"
  ) {
    return false;
  }

  return platform === "darwin"
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}
