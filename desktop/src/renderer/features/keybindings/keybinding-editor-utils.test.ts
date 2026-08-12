import {
  createDefaultKeybindingRules,
  findConflicts,
} from "@shared/keybindings";
import { describe, expect, it } from "vitest";

import {
  findCandidateConflicts,
  findConflictForBinding,
} from "./keybinding-editor-utils";

describe("findConflictForBinding", () => {
  it("matches both sides of a chord-prefix conflict by their rule key", () => {
    const conflicts = findConflicts(
      [
        { command: "palette.open", key: "mod+k", source: "default" },
        {
          command: "files.save",
          key: "mod+k mod+s",
          source: "default",
        },
      ],
      "mac",
    );

    expect(
      findConflictForBinding(conflicts, "palette.open", { key: "mod+k" })?.kind,
    ).toBe("chord-prefix");
    expect(
      findConflictForBinding(conflicts, "files.save", {
        key: "mod+k mod+s",
      })?.kind,
    ).toBe("chord-prefix");
  });
});

describe("findCandidateConflicts", () => {
  it("reports the other command before a candidate is saved", () => {
    const conflicts = findCandidateConflicts({
      commandId: "chat.new",
      key: "mod+shift+p",
      platform: "mac",
      rules: createDefaultKeybindingRules(),
    });

    expect(
      conflicts.some((conflict) =>
        conflict.rules.some((rule) => rule.command === "palette.open"),
      ),
    ).toBe(true);
  });

  it("does not treat the same command as a conflict", () => {
    const conflicts = findCandidateConflicts({
      commandId: "palette.open",
      key: "mod+shift+p",
      platform: "mac",
      rules: createDefaultKeybindingRules(),
    });

    expect(conflicts).toEqual([]);
  });

  it("ignores an unrelated pre-existing conflict", () => {
    const conflicts = findCandidateConflicts({
      commandId: "chat.new",
      key: "mod+n",
      platform: "mac",
      rules: [
        ...createDefaultKeybindingRules(),
        { command: "chat.archive", key: "mod+k", source: "user" },
        { command: "chat.delete", key: "mod+k", source: "user" },
      ],
    });

    expect(conflicts).toEqual([]);
  });
});
