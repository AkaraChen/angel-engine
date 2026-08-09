/** Desktop-only keymap types (KIT-796 / KIT-797). Not part of engine wire. */

export type CommandId = string;

export type KeymapPlatform = "mac" | "win" | "linux";

export type ScopeName = "app" | "window" | "view" | "panel" | "editable";

export type BindingSource = "default" | "user";

export type EditableBehavior = "suppress" | "allow";

export interface ParsedSegment {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

export interface ParsedBinding {
  segments: [ParsedSegment] | [ParsedSegment, ParsedSegment];
}

export interface BindingParseError {
  code:
    | "empty"
    | "too-many-segments"
    | "empty-segment"
    | "unknown-key"
    | "shifted-glyph"
    | "mod-conflict"
    | "missing-key"
    | "duplicate-modifier";
  message: string;
  suggestion?: string;
}

export type WhenExpr = string;

export interface KeybindingRule {
  key: string;
  command: CommandId | `-${CommandId}`;
  when?: WhenExpr;
  args?: unknown;
  platform?: KeymapPlatform[];
  editableBehavior?: EditableBehavior;
  repeatable?: boolean;
  owner?: string;
  source: BindingSource;
}

export interface CommandDescriptor {
  id: CommandId;
  titleKey: string;
  categoryKey: string;
  when?: WhenExpr;
  bindable: boolean;
  handlerScope: ScopeName;
  invocableFromMain: boolean;
  deprecatedBy?: CommandId;
  hidden?: boolean;
}

export interface KeybindingUserEntry {
  key?: string;
  command: CommandId | `-${CommandId}`;
  when?: string;
  args?: unknown;
}

export interface KeybindingsFile {
  version: 1;
  bindings: KeybindingUserEntry[];
}

export interface LoadWarning {
  code: string;
  message: string;
  entryIndex?: number;
}

export type LoadFatal =
  | { kind: "parse-error"; message: string }
  | { kind: "unsupported-version"; version: unknown };

export interface ConflictRuleRef {
  command: CommandId;
  when?: string;
  source: BindingSource;
  scope: ScopeName;
  key: string;
  owner?: string;
}

export interface Conflict {
  kind: "ambiguous" | "shadowed" | "chord-prefix";
  key: string;
  rules: readonly ConflictRuleRef[];
  winner?: ConflictRuleRef;
  messageKey: string;
}

export interface EffectiveBinding {
  command: CommandId;
  key: string;
  when?: string;
  source: BindingSource;
  owner?: string;
  editableBehavior?: EditableBehavior;
  origin: { kind: "default" } | { kind: "user-positive"; index: number };
}

export type ContextKeyValues = Record<string, string | boolean | undefined>;
