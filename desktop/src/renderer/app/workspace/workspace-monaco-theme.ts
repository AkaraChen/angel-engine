import type { editor } from "monaco-editor";

/**
 * Monaco resolves theme colours once at `defineTheme` time and cannot read CSS
 * custom properties, so the token values from `index-foundation.css` are
 * mirrored here as literals. Keep the two in sync: every value below is a
 * comment-annotated copy of a foundation token, not a new colour.
 *
 * The syntax ramp is derived from azure + `ink` + `--status-*` only:
 * keywords and types walk down the azure ramp, strings borrow
 * `--status-success`, numbers/constants take the warm vermilion the file-tree
 * palette already uses, and everything structural (variables, punctuation)
 * sits on the neutral ramp so a screen of code reads as mostly ink with a few
 * blue anchors.
 */
export const workspaceMonacoThemeLight = "angel-light";
export const workspaceMonacoThemeDark = "angel-dark";

const lightRules: editor.ITokenThemeRule[] = [
  // azure-600 — keywords and control flow.
  { token: "keyword", foreground: "1b60f5" },
  { token: "keyword.operator", foreground: "1b60f5" },
  { token: "storage", foreground: "1b60f5" },
  { token: "storage.type", foreground: "1b60f5" },
  { token: "constant.language", foreground: "1b60f5" },
  { token: "constant.language.boolean", foreground: "1b60f5" },
  { token: "tag", foreground: "1b60f5" },
  { token: "entity.name.tag", foreground: "1b60f5" },
  { token: "meta.module-reference", foreground: "1b60f5" },
  // azure-800 — types read heavier than keywords so declarations stand out.
  { token: "type", foreground: "173db6" },
  { token: "type.identifier", foreground: "173db6" },
  { token: "entity.name.type", foreground: "173db6" },
  { token: "support.type", foreground: "173db6" },
  { token: "support.type.builtin", foreground: "173db6" },
  { token: "namespace", foreground: "173db6" },
  // azure-700 — callables.
  { token: "function", foreground: "144be1" },
  { token: "entity.name", foreground: "144be1" },
  { token: "entity.name.function", foreground: "144be1" },
  { token: "support.function", foreground: "144be1" },
  // --status-success.
  { token: "string", foreground: "009767" },
  { token: "attribute.value", foreground: "009767" },
  // Warm vermilion, shared with --trees-icon-vermilion.
  { token: "number", foreground: "a65e2b" },
  { token: "constant", foreground: "a65e2b" },
  { token: "constant.numeric", foreground: "a65e2b" },
  { token: "support.constant", foreground: "a65e2b" },
  { token: "variable.language", foreground: "a65e2b" },
  // --status-attention — regexes are a warning-shaped thing to spot.
  { token: "regexp", foreground: "9a7b1a" },
  { token: "string.regexp", foreground: "9a7b1a" },
  // ink-700 / ink-600 — identifiers and keys stay ink so the blues can lead.
  { token: "identifier", foreground: "44403b" },
  { token: "variable", foreground: "44403b" },
  { token: "property", foreground: "57534d" },
  { token: "attribute.name", foreground: "57534d" },
  { token: "meta.property-name", foreground: "57534d" },
  { token: "meta.object-literal.key", foreground: "57534d" },
  { token: "entity.other.attribute-name", foreground: "57534d" },
  { token: "support", foreground: "57534d" },
  // ink-500 — punctuation recedes.
  { token: "operator", foreground: "79716b" },
  { token: "delimiter", foreground: "79716b" },
  { token: "delimiter.bracket", foreground: "79716b" },
  // --muted-foreground.
  { token: "comment", foreground: "6b645d", fontStyle: "italic" },
  { token: "string.comment", foreground: "6b645d", fontStyle: "italic" },
  { token: "markup.heading", foreground: "1b60f5", fontStyle: "bold" },
  { token: "markup.quote", foreground: "6b645d", fontStyle: "italic" },
  { token: "markup.raw", foreground: "009767" },
  { token: "markup.italic", fontStyle: "italic" },
  { token: "markup.bold", fontStyle: "bold" },
];

const darkRules: editor.ITokenThemeRule[] = [
  // Dark --primary.
  { token: "keyword", foreground: "69a3ff" },
  { token: "keyword.operator", foreground: "69a3ff" },
  { token: "storage", foreground: "69a3ff" },
  { token: "storage.type", foreground: "69a3ff" },
  { token: "constant.language", foreground: "69a3ff" },
  { token: "constant.language.boolean", foreground: "69a3ff" },
  { token: "tag", foreground: "69a3ff" },
  { token: "entity.name.tag", foreground: "69a3ff" },
  { token: "meta.module-reference", foreground: "69a3ff" },
  // azure-200.
  { token: "type", foreground: "bcdbff" },
  { token: "type.identifier", foreground: "bcdbff" },
  { token: "entity.name.type", foreground: "bcdbff" },
  { token: "support.type", foreground: "bcdbff" },
  { token: "support.type.builtin", foreground: "bcdbff" },
  { token: "namespace", foreground: "bcdbff" },
  // azure-300.
  { token: "function", foreground: "8ec6ff" },
  { token: "entity.name", foreground: "8ec6ff" },
  { token: "entity.name.function", foreground: "8ec6ff" },
  { token: "support.function", foreground: "8ec6ff" },
  // Dark --status-success.
  { token: "string", foreground: "00d294" },
  { token: "attribute.value", foreground: "00d294" },
  { token: "number", foreground: "d4976c" },
  { token: "constant", foreground: "d4976c" },
  { token: "constant.numeric", foreground: "d4976c" },
  { token: "support.constant", foreground: "d4976c" },
  { token: "variable.language", foreground: "d4976c" },
  // Dark --status-attention.
  { token: "regexp", foreground: "f0b100" },
  { token: "string.regexp", foreground: "f0b100" },
  // ink-300 / ink-400.
  { token: "identifier", foreground: "d6d3d1" },
  { token: "variable", foreground: "d6d3d1" },
  { token: "property", foreground: "bdb9b6" },
  { token: "attribute.name", foreground: "bdb9b6" },
  { token: "meta.property-name", foreground: "bdb9b6" },
  { token: "meta.object-literal.key", foreground: "bdb9b6" },
  { token: "entity.other.attribute-name", foreground: "bdb9b6" },
  { token: "support", foreground: "bdb9b6" },
  { token: "operator", foreground: "a6a09b" },
  { token: "delimiter", foreground: "a6a09b" },
  { token: "delimiter.bracket", foreground: "a6a09b" },
  // Dark --muted-foreground (#f0f0ee at 56%), flattened onto #0c0c0c.
  { token: "comment", foreground: "8e8e8d", fontStyle: "italic" },
  { token: "string.comment", foreground: "8e8e8d", fontStyle: "italic" },
  { token: "markup.heading", foreground: "69a3ff", fontStyle: "bold" },
  { token: "markup.quote", foreground: "8e8e8d", fontStyle: "italic" },
  { token: "markup.raw", foreground: "00d294" },
  { token: "markup.italic", fontStyle: "italic" },
  { token: "markup.bold", fontStyle: "bold" },
];

const lightTheme: editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  colors: {
    // --card: one step brighter than the cream page, so the edit surface lifts.
    "editor.background": "#ffffff",
    "editor.foreground": "#1a1a1a",
    "editorCursor.foreground": "#3784ff",
    "editorLineNumber.foreground": "#6b645d80",
    "editorLineNumber.activeForeground": "#1a1a1a",
    // --overlay-hover.
    "editor.lineHighlightBackground": "#2925240e",
    "editor.lineHighlightBorder": "#00000000",
    // --primary-soft.
    "editor.selectionBackground": "#d5e5ff",
    "editor.inactiveSelectionBackground": "#d5e5ff80",
    "editor.selectionHighlightBackground": "#d5e5ff80",
    "editor.wordHighlightBackground": "#d5e5ff66",
    "editor.wordHighlightStrongBackground": "#d5e5ff",
    "editor.foldBackground": "#d5e5ff4d",
    "editorBracketMatch.background": "#d5e5ff",
    "editorBracketMatch.border": "#00000000",
    // --border-subtle / --border-strong: guides are barely there on purpose.
    "editorIndentGuide.background": "#edece8",
    "editorIndentGuide.activeBackground": "#d4d4d0",
    "editorWhitespace.foreground": "#edece8",
    // --status-attention-soft.
    "editor.findMatchBackground": "#fcdfb6",
    "editor.findMatchHighlightBackground": "#ffefd9",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#e4e3e0",
    "editorStickyScroll.background": "#ffffff",
    "editorStickyScrollHover.background": "#2925240e",
    "editorGutter.background": "#ffffff",
  },
  rules: lightRules,
};

const darkTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  colors: {
    "editor.background": "#0c0c0c",
    "editor.foreground": "#f0f0ee",
    "editorCursor.foreground": "#69a3ff",
    "editorLineNumber.foreground": "#f0f0ee50",
    "editorLineNumber.activeForeground": "#f0f0ee",
    // --overlay-hover.
    "editor.lineHighlightBackground": "#ebebea12",
    "editor.lineHighlightBorder": "#00000000",
    // --primary-soft.
    "editor.selectionBackground": "#69a3ff24",
    "editor.inactiveSelectionBackground": "#69a3ff14",
    "editor.selectionHighlightBackground": "#69a3ff14",
    "editor.wordHighlightBackground": "#69a3ff14",
    "editor.wordHighlightStrongBackground": "#69a3ff24",
    "editor.foldBackground": "#69a3ff14",
    "editorBracketMatch.background": "#69a3ff28",
    "editorBracketMatch.border": "#00000000",
    "editorIndentGuide.background": "#191919",
    "editorIndentGuide.activeBackground": "#2b2b2b",
    "editorWhitespace.foreground": "#191919",
    "editor.findMatchBackground": "#f0b10038",
    "editor.findMatchHighlightBackground": "#f0b10024",
    "editorWidget.background": "#171717",
    "editorWidget.border": "#1e1e1e",
    "editorStickyScroll.background": "#0c0c0c",
    "editorStickyScrollHover.background": "#ebebea12",
    "editorGutter.background": "#0c0c0c",
  },
  rules: darkRules,
};

export function defineWorkspaceMonacoThemes(
  monaco: typeof import("monaco-editor"),
) {
  monaco.editor.defineTheme(workspaceMonacoThemeLight, lightTheme);
  monaco.editor.defineTheme(workspaceMonacoThemeDark, darkTheme);
}
