import type {
  KeybindingRule,
  KeybindingUserEntry,
  KeymapPlatform,
} from "./types";
import { createDefaultKeybindingRules } from "./default-bindings";
import { toElectronAccelerator } from "./electron-accelerator";
import { mergeKeybindingLayers } from "./merge-bindings";

/**
 * Resolve the Electron accelerator for an invocable-from-main command from the
 * merged keymap only. Returns undefined when the command has no single-segment
 * binding (unbound, chord-only, or missing) — callers must not fall back to a
 * hard-coded default, or unbind would be ignored.
 */
export function acceleratorForCommand(
  commandId: string,
  options: {
    userEntries: readonly KeybindingUserEntry[];
    platform: KeymapPlatform;
    defaultRules?: readonly KeybindingRule[];
  },
): string | undefined {
  const { rules } = mergeKeybindingLayers({
    defaultRules: options.defaultRules ?? createDefaultKeybindingRules(),
    userEntries: options.userEntries,
    platform: options.platform,
  });

  // Prefer a when-less binding (menu cannot evaluate focus-dependent when).
  const candidates = rules.filter(
    (rule) => rule.command === commandId && !rule.command.startsWith("-"),
  );
  const match =
    candidates.find((rule) => !rule.when) ?? candidates[0] ?? undefined;
  if (!match) return undefined;
  return toElectronAccelerator(match.key, options.platform);
}
