import type {
  CommandId,
  Conflict,
  ConflictRuleRef,
  KeybindingRule,
  KeymapPlatform,
  ScopeName,
} from "./types";
import { getCommandDescriptor } from "./commands";
import { parseBinding, stringifyBinding } from "./parse-binding";
import { whenExprsMayBothBeTrue, whenSpecificity } from "./when-expr";

function scopeDepth(scope: ScopeName): number {
  switch (scope) {
    case "app":
      return 1;
    case "window":
      return 2;
    case "view":
      return 3;
    case "panel":
      return 4;
    case "editable":
      return 5;
  }
}

function toRef(rule: KeybindingRule, scope: ScopeName): ConflictRuleRef {
  return {
    command: rule.command as CommandId,
    when: rule.when,
    source: rule.source,
    scope,
    key: rule.key,
    owner: rule.owner,
  };
}

function compareRules(a: KeybindingRule, b: KeybindingRule): number {
  const scopeA =
    getCommandDescriptor(a.command as CommandId)?.handlerScope ?? "app";
  const scopeB =
    getCommandDescriptor(b.command as CommandId)?.handlerScope ?? "app";
  const depth = scopeDepth(scopeB) - scopeDepth(scopeA);
  if (depth !== 0) return depth;

  if (a.source !== b.source) {
    return a.source === "user" ? -1 : 1;
  }

  const spec = whenSpecificity(b.when) - whenSpecificity(a.when);
  if (spec !== 0) return spec;

  return 0;
}

export function findConflicts(
  rules: readonly KeybindingRule[],
  platform: KeymapPlatform,
): Conflict[] {
  const positives = rules.filter(
    (rule) => typeof rule.command === "string" && !rule.command.startsWith("-"),
  );

  const byKey = new Map<string, KeybindingRule[]>();
  for (const rule of positives) {
    const parsed = parseBinding(rule.key, platform);
    const key = parsed.ok ? stringifyBinding(parsed.value, platform) : rule.key;
    const list = byKey.get(key) ?? [];
    list.push({ ...rule, key });
    byKey.set(key, list);
  }

  const conflicts: Conflict[] = [];

  for (const [key, group] of byKey) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.command === b.command && (a.when ?? "") === (b.when ?? "")) {
          continue;
        }
        if (!whenExprsMayBothBeTrue(a.when, b.when)) continue;

        const ranked = [a, b].sort(compareRules);
        const winnerRule = ranked[0]!;
        const loserRule = ranked[1]!;
        const winnerScope =
          getCommandDescriptor(winnerRule.command as CommandId)?.handlerScope ??
          "app";
        const loserScope =
          getCommandDescriptor(loserRule.command as CommandId)?.handlerScope ??
          "app";

        const ambiguous = compareRules(a, b) === 0 && compareRules(b, a) === 0;

        conflicts.push({
          kind: ambiguous ? "ambiguous" : "shadowed",
          key,
          rules: [toRef(winnerRule, winnerScope), toRef(loserRule, loserScope)],
          winner: ambiguous ? undefined : toRef(winnerRule, winnerScope),
          messageKey: ambiguous
            ? "settings.keyboard.conflictAmbiguous"
            : "settings.keyboard.conflictShadowed",
        });
      }
    }
  }

  // Chord prefix conflicts: single-segment key that is prefix of a two-segment chord
  const singles = new Map<string, KeybindingRule[]>();
  const chords: Array<{ prefix: string; full: string; rule: KeybindingRule }> =
    [];

  for (const rule of positives) {
    const parsed = parseBinding(rule.key, platform);
    if (!parsed.ok) continue;
    const full = stringifyBinding(parsed.value, platform);
    if (parsed.value.segments.length === 1) {
      const list = singles.get(full) ?? [];
      list.push(rule);
      singles.set(full, list);
    } else {
      const prefix = stringifyBinding(
        { segments: [parsed.value.segments[0]!] },
        platform,
      );
      chords.push({ prefix, full, rule });
    }
  }

  for (const chord of chords) {
    const prefixRules = singles.get(chord.prefix) ?? [];
    for (const single of prefixRules) {
      if (!whenExprsMayBothBeTrue(single.when, chord.rule.when)) continue;
      const singleScope =
        getCommandDescriptor(single.command as CommandId)?.handlerScope ??
        "app";
      const chordScope =
        getCommandDescriptor(chord.rule.command as CommandId)?.handlerScope ??
        "app";
      conflicts.push({
        kind: "chord-prefix",
        key: chord.prefix,
        rules: [toRef(single, singleScope), toRef(chord.rule, chordScope)],
        messageKey: "settings.keyboard.conflictChordPrefix",
      });
    }
  }

  return conflicts;
}
