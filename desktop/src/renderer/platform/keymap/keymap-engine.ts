import type {
  CommandId,
  Conflict,
  ContextKeyValues,
  KeybindingRule,
  KeymapPlatform,
  LoadWarning,
  ParsedSegment,
  ScopeName,
} from "@shared/keybindings";
import {
  evaluateWhen,
  findConflicts,
  getCommandDescriptor,
  parseBinding,
  segmentHasModifier,
  segmentsEqual,
  stringifyBinding,
  whenSpecificity,
} from "@shared/keybindings";
import { commandRegistry } from "./registry";
import {
  type ResolveKeyboardEvent,
  resolveCandidates,
} from "./resolve-candidates";

export type DispatchResult =
  | { kind: "ignored" }
  | { kind: "chord-pending"; prefix: ParsedSegment }
  | {
      kind: "chord-cancelled";
      reason: "timeout" | "escape" | "blur" | "unmatched";
    }
  | { kind: "executed"; command: CommandId };

export interface LoadedKeymap {
  rules: KeybindingRule[];
  conflicts: Conflict[];
  warnings: LoadWarning[];
  platform: KeymapPlatform;
  lookup(command: CommandId): string[];
  findConflicts(): Conflict[];
}

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

function compareForDispatch(a: KeybindingRule, b: KeybindingRule): number {
  const scopeA =
    getCommandDescriptor(a.command as CommandId)?.handlerScope ?? "app";
  const scopeB =
    getCommandDescriptor(b.command as CommandId)?.handlerScope ?? "app";
  const depth = scopeDepth(scopeB) - scopeDepth(scopeA);
  if (depth !== 0) return depth;
  if (a.source !== b.source) return a.source === "user" ? -1 : 1;
  return whenSpecificity(b.when) - whenSpecificity(a.when);
}

export function loadKeymap(options: {
  rules: KeybindingRule[];
  warnings?: LoadWarning[];
  platform: KeymapPlatform;
}): LoadedKeymap {
  const { rules, platform, warnings = [] } = options;
  const conflicts = findConflicts(rules, platform);

  return {
    rules,
    conflicts,
    warnings,
    platform,
    lookup(command) {
      return rules
        .filter((rule) => rule.command === command)
        .map((rule) => rule.key);
    },
    findConflicts: () => conflicts,
  };
}

export interface KeymapDispatchState {
  chordPending: ParsedSegment | null;
  recording: boolean;
}

export async function dispatchKeyEvent(options: {
  event: ResolveKeyboardEvent & {
    preventDefault: () => void;
    stopPropagation: () => void;
  };
  keymap: LoadedKeymap;
  context: ContextKeyValues;
  captureZoneId?: string | null;
  focusEditable: boolean;
  state: KeymapDispatchState;
  onChordTimeout: () => void;
}): Promise<DispatchResult> {
  const { event, keymap, context, captureZoneId, focusEditable, state } =
    options;

  if (state.recording) {
    return { kind: "ignored" };
  }

  if (event.repeat) {
    // Only allow if some matching rule is repeatable — checked later; default drop.
  }

  const candidates = resolveCandidates(event, keymap.platform);
  if (candidates.length === 0) {
    return { kind: "ignored" };
  }

  if (state.chordPending) {
    for (const candidate of candidates) {
      if (candidate.key === "escape" && !segmentHasModifier(candidate)) {
        state.chordPending = null;
        event.preventDefault();
        event.stopPropagation();
        return { kind: "chord-cancelled", reason: "escape" };
      }
    }
  }

  const matchingRules: KeybindingRule[] = [];

  for (const candidate of candidates) {
    for (const rule of keymap.rules) {
      if (typeof rule.command !== "string" || rule.command.startsWith("-")) {
        continue;
      }
      const parsed = parseBinding(rule.key, keymap.platform);
      if (!parsed.ok) continue;

      if (state.chordPending) {
        if (parsed.value.segments.length !== 2) continue;
        if (!segmentsEqual(parsed.value.segments[0]!, state.chordPending)) {
          continue;
        }
        if (!segmentsEqual(parsed.value.segments[1]!, candidate)) continue;
      } else {
        if (parsed.value.segments.length === 2) {
          if (segmentsEqual(parsed.value.segments[0]!, candidate)) {
            // chord prefix — handled after full scan
            matchingRules.push(rule);
            continue;
          }
          continue;
        }
        if (!segmentsEqual(parsed.value.segments[0]!, candidate)) continue;
      }

      if (rule.when && !evaluateWhen(rule.when, context)) continue;

      const hasMod = segmentHasModifier(parsed.value.segments[0]!);
      const editableBehavior =
        rule.editableBehavior ?? (hasMod ? "allow" : "suppress");

      if (focusEditable && !hasMod) {
        if (editableBehavior !== "allow") continue;
        if (!rule.owner || rule.owner !== captureZoneId) continue;
      }
      if (focusEditable && hasMod && editableBehavior === "suppress") {
        continue;
      }

      if (captureZoneId) {
        const scope =
          getCommandDescriptor(rule.command as CommandId)?.handlerScope ??
          "app";
        // E3: app/window always; deeper scopes only when owner matches capture zone.
        if (scope !== "app" && scope !== "window") {
          if (rule.owner !== captureZoneId) continue;
        }
      }

      if (event.repeat && !rule.repeatable) continue;

      matchingRules.push(rule);
    }

    // Prefer first candidate that produced matches
    if (matchingRules.length > 0) break;
  }

  if (matchingRules.length === 0) {
    if (state.chordPending) {
      state.chordPending = null;
      return { kind: "chord-cancelled", reason: "unmatched" };
    }
    return { kind: "ignored" };
  }

  // Chord start: if best matches are two-segment with matching prefix only
  if (!state.chordPending) {
    const chordStarts = matchingRules.filter((rule) => {
      const parsed = parseBinding(rule.key, keymap.platform);
      return parsed.ok && parsed.value.segments.length === 2;
    });
    const singles = matchingRules.filter((rule) => {
      const parsed = parseBinding(rule.key, keymap.platform);
      return parsed.ok && parsed.value.segments.length === 1;
    });

    if (chordStarts.length > 0 && singles.length === 0) {
      const first = parseBinding(chordStarts[0]!.key, keymap.platform);
      if (first.ok) {
        state.chordPending = first.value.segments[0]!;
        event.preventDefault();
        event.stopPropagation();
        window.setTimeout(() => {
          if (state.chordPending) {
            state.chordPending = null;
            options.onChordTimeout();
          }
        }, 5000);
        return {
          kind: "chord-pending",
          prefix: first.value.segments[0]!,
        };
      }
    }
  }

  const executable = matchingRules
    .filter((rule) => {
      const parsed = parseBinding(rule.key, keymap.platform);
      if (!parsed.ok) return false;
      if (state.chordPending) return parsed.value.segments.length === 2;
      return parsed.value.segments.length === 1;
    })
    .sort(compareForDispatch);

  for (const rule of executable) {
    const id = rule.command as CommandId;
    if (!commandRegistry.hasHandler(id)) {
      continue;
    }
    const ok = await commandRegistry.execute(id, rule.args, context);
    if (ok) {
      state.chordPending = null;
      event.preventDefault();
      event.stopPropagation();
      return { kind: "executed", command: id };
    }
  }

  return { kind: "ignored" };
}

export function formatLookup(
  keymap: LoadedKeymap,
  command: CommandId,
): string[] {
  return keymap.lookup(command).map((key) => {
    const parsed = parseBinding(key, keymap.platform);
    return parsed.ok ? stringifyBinding(parsed.value) : key;
  });
}
