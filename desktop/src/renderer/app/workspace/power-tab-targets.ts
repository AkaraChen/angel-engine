/**
 * Visible power-mode tab bar targets for Ctrl+Tab cycling.
 * Draft is included only when already open — never as a "create draft" slot.
 */
export type PowerTabTarget<TChat> =
  | { kind: "home" }
  | { kind: "draft" }
  | { kind: "chat"; chat: TChat };

export function buildPowerTabTargets<TChat extends { id: string }>(options: {
  powerModeActive: boolean;
  hasHomeTab: boolean;
  draftTabActive: boolean;
  chats: readonly TChat[];
}): PowerTabTarget<TChat>[] {
  if (!options.powerModeActive) return [];
  const targets: PowerTabTarget<TChat>[] = [];
  if (options.hasHomeTab) {
    targets.push({ kind: "home" });
  }
  for (const chat of options.chats) {
    targets.push({ kind: "chat", chat });
  }
  if (options.draftTabActive) {
    targets.push({ kind: "draft" });
  }
  return targets;
}

export function currentPowerTabIndex<TChat extends { id: string }>(
  targets: readonly PowerTabTarget<TChat>[],
  options: {
    draftTabActive: boolean;
    homePageActive: boolean;
    selectedChatId?: string | null;
  },
): number {
  if (targets.length === 0) return -1;
  if (options.draftTabActive) {
    return targets.findIndex((target) => target.kind === "draft");
  }
  if (options.homePageActive && !options.selectedChatId) {
    return targets.findIndex((target) => target.kind === "home");
  }
  if (options.selectedChatId) {
    const idx = targets.findIndex(
      (target) =>
        target.kind === "chat" && target.chat.id === options.selectedChatId,
    );
    if (idx >= 0) return idx;
  }
  const home = targets.findIndex((target) => target.kind === "home");
  if (home >= 0) return home;
  return 0;
}

export function cyclePowerTabIndex(
  targetsLength: number,
  currentIndex: number,
  direction: 1 | -1,
): number | null {
  if (targetsLength < 2 || currentIndex < 0) return null;
  return (currentIndex + direction + targetsLength) % targetsLength;
}
