// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KeybindingHint } from "./keybinding-hint";

let keybindingHintsEnabled = true;

vi.mock("@/features/keybindings/keybinding-hints-store", () => ({
  useKeybindingHintsStore: (
    selector: (state: { enabled: boolean }) => boolean,
  ) => selector({ enabled: keybindingHintsEnabled }),
}));

beforeEach(() => {
  keybindingHintsEnabled = true;
});

afterEach(() => {
  cleanup();
  keybindingHintsEnabled = true;
});

describe("KeybindingHint", () => {
  it("splits mac modifiers into independent key caps", () => {
    render(<KeybindingHint binding="⌘K" />);

    expect(screen.getByText("⌘").dataset.slot).toBe("kbd");
    expect(screen.getByText("K").dataset.slot).toBe("kbd");
  });

  it("keeps windows separators between independent key caps", () => {
    render(<KeybindingHint binding="Ctrl+Shift+P" />);

    expect(screen.getByText("Ctrl")).toBeTruthy();
    expect(screen.getByText("Shift")).toBeTruthy();
    expect(screen.getByText("P")).toBeTruthy();
    expect(screen.getAllByText("+")).toHaveLength(2);
  });

  it("hides the hint without disabling its caller", () => {
    keybindingHintsEnabled = false;

    const { container } = render(<KeybindingHint binding="Ctrl+K" />);

    expect(container.firstChild).toBeNull();
  });

  it("can remain visible in settings previews", () => {
    keybindingHintsEnabled = false;

    render(<KeybindingHint binding="Ctrl+K" respectPreference={false} />);

    expect(screen.getByText("Ctrl")).toBeTruthy();
    expect(screen.getByText("K")).toBeTruthy();
  });
});
