// @vitest-environment jsdom

import { createDefaultKeybindingRules } from "@shared/keybindings";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KeybindingRecorder } from "./keybinding-recorder";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === "settings.keyboard.saveAnyway") return "Save anyway";
      if (key === "settings.keyboard.conflictWith") {
        return `Conflicts with ${values?.command}`;
      }
      if (key.toLowerCase().includes("palette")) return "Open command palette";
      return key;
    },
  }),
}));

afterEach(cleanup);

describe("KeybindingRecorder", () => {
  it("previews a conflicting candidate before saving and focuses confirmation", () => {
    const onRecorded = vi.fn();
    render(
      <KeybindingRecorder
        commandId="chat.new"
        onCancel={vi.fn()}
        onJumpToConflict={vi.fn()}
        onRecorded={onRecorded}
        platform="mac"
        rules={createDefaultKeybindingRules()}
      />,
    );

    fireEvent.keyDown(window, {
      code: "KeyP",
      key: "p",
      metaKey: true,
      shiftKey: true,
    });

    const confirm = screen.getByRole("button", { name: "Save anyway" });
    expect(onRecorded).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(confirm);
    expect(
      screen.getByText("Conflicts with Open command palette"),
    ).toBeTruthy();

    fireEvent.click(confirm);
    expect(onRecorded).toHaveBeenCalledWith("mod+shift+p");
  });
});
