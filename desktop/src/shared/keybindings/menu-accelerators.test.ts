import { describe, expect, it } from "vitest";

import { COMMAND_IDS } from "./commands";
import { acceleratorForCommand } from "./menu-accelerators";

describe("acceleratorForCommand", () => {
  it("returns the default accelerator when user layer is empty", () => {
    expect(
      acceleratorForCommand(COMMAND_IDS.chatNew, {
        userEntries: [],
        platform: "mac",
      }),
    ).toBe("CmdOrCtrl+N");
  });

  it("returns undefined after whole-command unbind (no hard-coded fallback)", () => {
    expect(
      acceleratorForCommand(COMMAND_IDS.chatNew, {
        userEntries: [{ command: "-chat.new" }],
        platform: "mac",
      }),
    ).toBeUndefined();
  });

  it("returns undefined for chord-only bindings Electron cannot express", () => {
    expect(
      acceleratorForCommand(COMMAND_IDS.chatNew, {
        userEntries: [
          { command: "-chat.new" },
          { key: "mod+k mod+n", command: "chat.new" },
        ],
        platform: "mac",
      }),
    ).toBeUndefined();
  });

  it("uses the user rebinding when present", () => {
    expect(
      acceleratorForCommand(COMMAND_IDS.workspaceToggleSidebar, {
        userEntries: [
          { key: "mod+b", command: "-workspace.toggleSidebar" },
          { key: "ctrl+shift+b", command: "workspace.toggleSidebar" },
        ],
        platform: "win",
      }),
    ).toBe("Ctrl+Shift+B");
  });

  it("returns undefined when only when-gated bindings remain", () => {
    // chat.send defaults are all when-gated; menu must not register them globally.
    expect(
      acceleratorForCommand(COMMAND_IDS.chatSend, {
        userEntries: [],
        platform: "mac",
      }),
    ).toBeUndefined();

    expect(
      acceleratorForCommand(COMMAND_IDS.chatNew, {
        userEntries: [
          { command: "-chat.new" },
          {
            key: "mod+n",
            command: "chat.new",
            when: "view.id == 'workspace'",
          },
        ],
        platform: "mac",
      }),
    ).toBeUndefined();

    // settings.close is when-gated so it must not become a global menu accelerator.
    expect(
      acceleratorForCommand(COMMAND_IDS.settingsClose, {
        userEntries: [],
        platform: "mac",
      }),
    ).toBeUndefined();
  });
});
