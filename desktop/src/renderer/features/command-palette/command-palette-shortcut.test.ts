import { describe, expect, it } from "vitest";

import { isCommandPaletteShortcut } from "./command-palette-shortcut";

const baseEvent = {
  altKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  key: "k",
  metaKey: false,
  repeat: false,
  shiftKey: false,
};

describe("isCommandPaletteShortcut", () => {
  it("uses Command on macOS and Control on other platforms", () => {
    expect(
      isCommandPaletteShortcut({ ...baseEvent, metaKey: true }, "darwin"),
    ).toBe(true);
    expect(
      isCommandPaletteShortcut({ ...baseEvent, ctrlKey: true }, "win32"),
    ).toBe(true);
    expect(
      isCommandPaletteShortcut({ ...baseEvent, ctrlKey: true }, "linux"),
    ).toBe(true);
  });

  it("preserves the other platform modifier's native behavior", () => {
    expect(
      isCommandPaletteShortcut({ ...baseEvent, ctrlKey: true }, "darwin"),
    ).toBe(false);
    expect(
      isCommandPaletteShortcut({ ...baseEvent, metaKey: true }, "win32"),
    ).toBe(false);
  });

  it("ignores modified, repeated, and already-handled events", () => {
    expect(
      isCommandPaletteShortcut(
        { ...baseEvent, ctrlKey: true, shiftKey: true },
        "win32",
      ),
    ).toBe(false);
    expect(
      isCommandPaletteShortcut(
        { ...baseEvent, ctrlKey: true, repeat: true },
        "win32",
      ),
    ).toBe(false);
    expect(
      isCommandPaletteShortcut(
        { ...baseEvent, ctrlKey: true, defaultPrevented: true },
        "win32",
      ),
    ).toBe(false);
  });
});
