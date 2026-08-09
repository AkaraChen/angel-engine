import type {
  EffectiveBinding,
  KeybindingRule,
  KeybindingUserEntry,
  KeymapPlatform,
  LoadWarning,
} from "./types";
import { getCommandDescriptor, stripUnbindPrefix } from "./commands";
import { parseBinding, stringifyBinding } from "./parse-binding";

function whenKey(when?: string): string {
  return when?.trim() ?? "";
}

function ruleIdentity(rule: Pick<KeybindingRule, "command" | "key" | "when">) {
  return `${rule.command}\0${rule.key}\0${whenKey(rule.when)}`;
}

function normalizeUserKey(
  key: string | undefined,
  platform: KeymapPlatform,
  warnings: LoadWarning[],
  entryIndex: number,
): string | undefined {
  if (key === undefined) return undefined;
  const parsed = parseBinding(key, platform);
  if (!parsed.ok) {
    warnings.push({
      code: "invalid-key",
      message: parsed.error.message,
      entryIndex,
    });
    return undefined;
  }
  return stringifyBinding(parsed.value, platform);
}

/**
 * Merge default rules with ordered user entries (KIT-797 §1.3).
 * User positives append; unbinds remove matching default (and prior user) rules.
 */
export function mergeKeybindingLayers(options: {
  defaultRules: readonly KeybindingRule[];
  userEntries: readonly KeybindingUserEntry[];
  platform: KeymapPlatform;
}): { rules: KeybindingRule[]; warnings: LoadWarning[] } {
  const { defaultRules, userEntries, platform } = options;
  const warnings: LoadWarning[] = [];

  let rules: KeybindingRule[] = defaultRules
    .filter((rule) => !rule.platform || rule.platform.includes(platform))
    .map((rule) => {
      const parsed = parseBinding(rule.key, platform);
      const key = parsed.ok
        ? stringifyBinding(parsed.value, platform)
        : rule.key;
      return { ...rule, key, source: "default" as const };
    });

  userEntries.forEach((entry, entryIndex) => {
    const { unbind, id } = stripUnbindPrefix(entry.command);
    const descriptor = getCommandDescriptor(id);
    if (!descriptor || descriptor.hidden) {
      if (descriptor?.deprecatedBy) {
        // handled below via rewrite
      } else if (!descriptor) {
        warnings.push({
          code: "unknown-command",
          message: `unknown or removed command: ${id}`,
          entryIndex,
        });
        return;
      }
    }

    const commandId = descriptor?.deprecatedBy ?? id;
    if (descriptor?.deprecatedBy) {
      warnings.push({
        code: "deprecated-command",
        message: `command ${id} rewritten to ${descriptor.deprecatedBy}`,
        entryIndex,
      });
    }

    if (unbind) {
      const key = normalizeUserKey(entry.key, platform, warnings, entryIndex);
      if (entry.key !== undefined && key === undefined) return;

      rules = rules.filter((rule) => {
        if (rule.command !== commandId) return true;
        if (key === undefined) {
          // Whole-command unbind removes default bindings only.
          return rule.source !== "default";
        }
        if (rule.key !== key) return true;
        if (whenKey(rule.when) !== whenKey(entry.when)) return true;
        return false;
      });
      return;
    }

    const key = normalizeUserKey(entry.key, platform, warnings, entryIndex);
    if (!key) {
      warnings.push({
        code: "missing-key",
        message: "positive binding requires a key",
        entryIndex,
      });
      return;
    }

    rules.push({
      key,
      command: commandId,
      when: entry.when,
      args: entry.args,
      source: "user",
    });
  });

  return { rules, warnings };
}

/** Effective bindings for settings UI, with origin tracing for rev A. */
export function listEffectiveBindings(options: {
  defaultRules: readonly KeybindingRule[];
  userEntries: readonly KeybindingUserEntry[];
  platform: KeymapPlatform;
  commandId?: string;
}): EffectiveBinding[] {
  const { defaultRules, userEntries, platform, commandId } = options;
  const { rules } = mergeKeybindingLayers({
    defaultRules,
    userEntries,
    platform,
  });

  const positives = userEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.command.startsWith("-"));

  const result: EffectiveBinding[] = [];
  for (const rule of rules) {
    if (typeof rule.command !== "string" || rule.command.startsWith("-")) {
      continue;
    }
    if (commandId && rule.command !== commandId) continue;

    let origin: EffectiveBinding["origin"] = { kind: "default" };
    if (rule.source === "user") {
      const match = [...positives].reverse().find(({ entry }) => {
        const key = entry.key ? parseBinding(entry.key, platform) : undefined;
        const canonical = key?.ok
          ? stringifyBinding(key.value, platform)
          : entry.key;
        return (
          entry.command === rule.command &&
          canonical === rule.key &&
          whenKey(entry.when) === whenKey(rule.when)
        );
      });
      origin = match
        ? { kind: "user-positive", index: match.index }
        : { kind: "user-positive", index: -1 };
    }

    result.push({
      command: rule.command,
      key: rule.key,
      when: rule.when,
      source: rule.source,
      owner: rule.owner,
      editableBehavior: rule.editableBehavior,
      origin,
    });
  }

  // Dedupe identical command+key+when (last wins for display)
  const seen = new Set<string>();
  const deduped: EffectiveBinding[] = [];
  for (const binding of [...result].reverse()) {
    const id = ruleIdentity(binding);
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.unshift(binding);
  }
  return deduped;
}
