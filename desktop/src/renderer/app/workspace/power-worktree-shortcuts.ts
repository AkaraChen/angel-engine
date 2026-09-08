export type PowerWorktreeShortcutAction =
  | "close-chat"
  | "close-draft"
  | "open-or-focus-draft";

export function powerWorktreeShortcutAction({
  altKey,
  ctrlKey,
  draftTabActive,
  hasActiveChat,
  key,
  metaKey,
  powerModeActive,
  repeat,
  shiftKey,
}: {
  altKey: boolean;
  ctrlKey: boolean;
  draftTabActive: boolean;
  hasActiveChat: boolean;
  key: string;
  metaKey: boolean;
  powerModeActive: boolean;
  repeat: boolean;
  shiftKey: boolean;
}): PowerWorktreeShortcutAction | null {
  if (!powerModeActive || !metaKey || ctrlKey || altKey || shiftKey || repeat) {
    return null;
  }

  const normalizedKey = key.toLowerCase();
  if (normalizedKey === "t") return "open-or-focus-draft";
  if (normalizedKey !== "w") return null;
  if (draftTabActive) return "close-draft";
  return hasActiveChat ? "close-chat" : null;
}
