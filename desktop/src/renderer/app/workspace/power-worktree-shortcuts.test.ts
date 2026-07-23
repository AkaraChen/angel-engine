import { describe, expect, it } from "vitest";
import { powerWorktreeShortcutAction } from "@/app/workspace/power-worktree-shortcuts";

const baseShortcut = {
  altKey: false,
  ctrlKey: false,
  draftTabActive: false,
  hasActiveChat: false,
  metaKey: true,
  powerModeActive: true,
  repeat: false,
  shiftKey: false,
};

describe("Mega Mode tab shortcuts", () => {
  it("opens or focuses the draft tab with Command T", () => {
    expect(powerWorktreeShortcutAction({ ...baseShortcut, key: "t" })).toBe(
      "open-or-focus-draft",
    );
  });

  it("closes the active draft or chat tab with Command W", () => {
    expect(
      powerWorktreeShortcutAction({
        ...baseShortcut,
        draftTabActive: true,
        key: "w",
      }),
    ).toBe("close-draft");
    expect(
      powerWorktreeShortcutAction({
        ...baseShortcut,
        hasActiveChat: true,
        key: "W",
      }),
    ).toBe("close-chat");
  });

  it("does not close Home or handle shortcuts outside Mega Mode", () => {
    expect(powerWorktreeShortcutAction({ ...baseShortcut, key: "w" })).toBe(
      null,
    );
    expect(
      powerWorktreeShortcutAction({
        ...baseShortcut,
        key: "t",
        powerModeActive: false,
      }),
    ).toBe(null);
  });

  it("ignores modified and repeated shortcuts", () => {
    expect(
      powerWorktreeShortcutAction({
        ...baseShortcut,
        key: "t",
        shiftKey: true,
      }),
    ).toBe(null);
    expect(
      powerWorktreeShortcutAction({
        ...baseShortcut,
        key: "w",
        repeat: true,
      }),
    ).toBe(null);
  });
});
