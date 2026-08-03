import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceTerminalTheme,
  workspaceTerminalThemes,
} from "@/app/workspace/workspace-terminal-theme";

describe("resolveWorkspaceTerminalTheme", () => {
  it("returns a fully-resolved theme for each scheme", () => {
    // The terminal has to repaint the moment the `dark` class flips, so the
    // resolver must not depend on computed styles or any other async read.
    expect(resolveWorkspaceTerminalTheme(true)).toBe(
      workspaceTerminalThemes.dark,
    );
    expect(resolveWorkspaceTerminalTheme(false)).toBe(
      workspaceTerminalThemes.light,
    );
  });

  it("grounds each scheme on its own background", () => {
    expect(workspaceTerminalThemes.light.background).toBe("#ffffff");
    expect(workspaceTerminalThemes.dark.background).toBe("#0c0d0b");
  });

  it("draws the cursor and selection from the primary ramp", () => {
    expect(workspaceTerminalThemes.light.cursor).toBe("#59802c");
    expect(workspaceTerminalThemes.light.selectionBackground).toBe("#dcecc2");
    expect(workspaceTerminalThemes.dark.cursor).toBe("#8dbb56");
    expect(workspaceTerminalThemes.dark.selectionBackground).toBe("#8dbb5624");
  });

  it("keeps the ANSI ramp off the raw hardware primaries", () => {
    const rawPrimaries = new Set([
      "#0000ff",
      "#00ff00",
      "#00ffff",
      "#ff0000",
      "#ff00ff",
      "#ffff00",
    ]);

    for (const theme of Object.values(workspaceTerminalThemes)) {
      for (const value of Object.values(theme)) {
        expect(rawPrimaries.has(value.toLowerCase())).toBe(false);
      }
    }
  });
});
