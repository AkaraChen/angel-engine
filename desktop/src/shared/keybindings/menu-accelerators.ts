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
 * merged keymap only.
 *
 * Only **when-less** single-segment bindings are eligible — the menu cannot
 * evaluate focus/context `when` expressions, so a conditional binding must not
 * become a global accelerator. Unbound / chord-only / when-only → undefined.
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

  const unconditional = rules.find(
    (rule) =>
      rule.command === commandId && !rule.command.startsWith("-") && !rule.when,
  );
  if (!unconditional) return undefined;
  return toElectronAccelerator(unconditional.key, options.platform);
}
