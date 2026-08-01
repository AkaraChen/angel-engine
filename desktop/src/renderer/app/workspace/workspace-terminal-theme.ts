import type { ITheme } from "@xterm/xterm";

/**
 * xterm resolves colours once per `options.theme` assignment and cannot read
 * CSS custom properties, so the tokens from `index-foundation.css` are
 * mirrored here as literals — keep the two in sync.
 *
 * The ANSI 16 are derived from the azure ramp, the warm `ink` ramp and the
 * `--status-*` trio rather than the default hardware primaries: raw #00ff00 /
 * #ff0000 on a cream or near-black ground is the single loudest thing in the
 * whole app, and a terminal a coding agent writes to constantly cannot be the
 * loudest thing.
 *
 * Both themes are plain literals rather than computed styles so a theme swap
 * is a synchronous object assignment — the terminal repaints on the same tick
 * the `dark` class flips, with no window reopen.
 */
export const workspaceTerminalThemes = {
  dark: {
    background: "#0c0c0c",
    black: "#292524",
    blue: "#59a5ff",
    brightBlack: "#57534d",
    brightBlue: "#8ec6ff",
    brightCyan: "#6fa3ab",
    brightGreen: "#4fd6a8",
    brightMagenta: "#c48ea0",
    brightRed: "#ff9092",
    brightWhite: "#fafaf9",
    brightYellow: "#f5c842",
    cursor: "#69a3ff",
    cursorAccent: "#0c0c0c",
    cyan: "#5d99a9",
    foreground: "#f0f0ee",
    green: "#00d294",
    magenta: "#a99cff",
    red: "#ff6467",
    selectionBackground: "#69a3ff24",
    selectionForeground: "#f0f0ee",
    white: "#d6d3d1",
    yellow: "#f0b100",
  },
  light: {
    // --card, so the terminal lifts off the cream page the same way the
    // editor does.
    background: "#ffffff",
    black: "#1c1917",
    blue: "#1b60f5",
    brightBlack: "#79716b",
    brightBlue: "#3784ff",
    brightCyan: "#3a7c85",
    brightGreen: "#00b37c",
    brightMagenta: "#96637b",
    brightRed: "#e0333c",
    brightWhite: "#1a1a1a",
    brightYellow: "#b8961f",
    cursor: "#3784ff",
    cursorAccent: "#ffffff",
    cyan: "#2e646c",
    foreground: "#1a1a1a",
    green: "#009767",
    magenta: "#7c6df0",
    red: "#c9262f",
    selectionBackground: "#d5e5ff",
    selectionForeground: "#1a1a1a",
    white: "#57534d",
    yellow: "#9a7b1a",
  },
} satisfies Record<"dark" | "light", ITheme>;

export function resolveWorkspaceTerminalTheme(dark: boolean): ITheme {
  return dark ? workspaceTerminalThemes.dark : workspaceTerminalThemes.light;
}
