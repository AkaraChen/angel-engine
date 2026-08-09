import {
  evaluateWhen,
  findConflicts,
  getCommandDescriptor,
  parseBinding,
  resolveActiveKeymapFocus,
  ruleOwnerMatchesFocus,
  scopeIsActive,
  segmentHasModifier,
  segmentsEqual,
  stringifyBinding,
  whenSpecificity,
  type ActiveKeymapFocus,
  type CommandId,
  type Conflict,
  type ContextKeyValues,
  type KeybindingRule,
  type KeymapPlatform,
  type LoadWarning,
  type ParsedSegment,
  type ScopeName,
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
  | { kind: "executed"; command: CommandId }
  | { kind: "claimed"; command: CommandId };

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
  chordTimer?: ReturnType<typeof setTimeout>;
}

export function matchKeybindingRules(options: {
  event: ResolveKeyboardEvent;
  keymap: LoadedKeymap;
  context: ContextKeyValues;
  focus: ActiveKeymapFocus;
  state: KeymapDispatchState;
}): KeybindingRule[] {
  const { event, keymap, context, focus, state } = options;

  if (state.recording) return [];

  const candidates = resolveCandidates(event, keymap.platform);
  if (candidates.length === 0) return [];

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
            matchingRules.push(rule);
            continue;
          }
          continue;
        }
        if (!segmentsEqual(parsed.value.segments[0]!, candidate)) continue;
      }

      if (rule.when && !evaluateWhen(rule.when, context)) continue;

      const descriptor = getCommandDescriptor(rule.command as CommandId);
      const scope = descriptor?.handlerScope ?? "app";
      if (!scopeIsActive(scope, focus.scopes)) continue;
      // Owner / scope-id gate (panel interrupt only in its own panel, etc.)
      if (!ruleOwnerMatchesFocus(scope, rule.owner, focus)) continue;

      const hasMod = segmentHasModifier(parsed.value.segments[0]!);
      const editableBehavior =
        rule.editableBehavior ?? (hasMod ? "allow" : "suppress");

      if (focus.focusEditable && !hasMod) {
        if (editableBehavior !== "allow") continue;
        if (!rule.owner || rule.owner !== focus.captureZoneId) continue;
      }
      if (focus.focusEditable && hasMod && editableBehavior === "suppress") {
        continue;
      }

      if (event.repeat && !rule.repeatable) continue;

      matchingRules.push(rule);
    }

    if (matchingRules.length > 0) break;
  }

  return matchingRules;
}

/**
 * Synchronous dispatch: claim + preventDefault happen before any async handler work.
 * Handlers still run (async OK) after the browser default is cancelled.
 */
export function dispatchKeyEvent(options: {
  event: ResolveKeyboardEvent & {
    preventDefault: () => void;
    stopPropagation: () => void;
    target?: EventTarget | null;
  };
  keymap: LoadedKeymap;
  context: ContextKeyValues;
  state: KeymapDispatchState;
  onChordTimeout?: () => void;
  /** Optional pre-resolved focus (tests); otherwise resolved from event.target. */
  focus?: ActiveKeymapFocus;
}): DispatchResult {
  const { event, keymap, context, state } = options;

  if (state.recording) {
    return { kind: "ignored" };
  }

  const focus =
    options.focus ??
    resolveActiveKeymapFocus(
      event.target ??
        (typeof document !== "undefined" ? document.activeElement : null),
    );

  const candidates = resolveCandidates(event, keymap.platform);
  if (candidates.length === 0) {
    return { kind: "ignored" };
  }

  if (state.chordPending) {
    for (const candidate of candidates) {
      if (candidate.key === "escape" && !segmentHasModifier(candidate)) {
        state.chordPending = null;
        if (state.chordTimer) clearTimeout(state.chordTimer);
        event.preventDefault();
        event.stopPropagation();
        return { kind: "chord-cancelled", reason: "escape" };
      }
    }
  }

  const matchingRules = matchKeybindingRules({
    event,
    keymap,
    context,
    focus,
    state,
  });

  if (matchingRules.length === 0) {
    if (state.chordPending) {
      state.chordPending = null;
      if (state.chordTimer) clearTimeout(state.chordTimer);
      return { kind: "chord-cancelled", reason: "unmatched" };
    }
    return { kind: "ignored" };
  }

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
        if (state.chordTimer) clearTimeout(state.chordTimer);
        state.chordTimer = setTimeout(() => {
          state.chordPending = null;
          options.onChordTimeout?.();
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
    // E4: only preventDefault after a handler accepts. Sync `false` falls
    // through to the next matching rule without consuming the event.
    const outcome = commandRegistry.tryExecute(id, rule.args, context);
    if (outcome === "missing" || outcome === "declined") {
      continue;
    }

    event.preventDefault();
    event.stopPropagation();
    state.chordPending = null;
    if (state.chordTimer) clearTimeout(state.chordTimer);
    return { kind: "claimed", command: id };
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
