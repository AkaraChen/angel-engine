import { describe, expect, it } from "vitest";

import { formatBinding } from "./format-binding";
import { parseBinding, stringifyBinding } from "./parse-binding";
import {
  appendUserBinding,
  replaceEffectiveBinding,
  removeEffectiveBinding,
} from "./user-delta";
import { createDefaultKeybindingRules } from "./default-bindings";
import { listEffectiveBindings, mergeKeybindingLayers } from "./merge-bindings";
import { findConflicts } from "./conflicts";
import { evaluateWhen } from "./when-expr";
import { COMMAND_IDS } from "./commands";

describe("parseBinding", () => {
  it("normalizes modifier order and case", () => {
    const parsed = parseBinding("Shift+Ctrl+P", "win");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(stringifyBinding(parsed.value)).toBe("ctrl+shift+p");
  });

  it("accepts mod and two-segment chords", () => {
    const parsed = parseBinding("mod+k mod+s", "mac");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(stringifyBinding(parsed.value)).toBe("mod+k mod+s");
  });

  it("rejects shifted glyphs with a suggestion", () => {
    const parsed = parseBinding("?", "mac");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("shifted-glyph");
    expect(parsed.error.suggestion).toContain("shift+/");
  });

  it("rejects mod+meta on mac and mod+ctrl on win", () => {
    expect(parseBinding("mod+meta+k", "mac").ok).toBe(false);
    expect(parseBinding("mod+ctrl+k", "win").ok).toBe(false);
    expect(parseBinding("mod+ctrl+k", "mac").ok).toBe(true);
  });
});

describe("formatBinding", () => {
  it("formats mac and windows styles", () => {
    const parsed = parseBinding("mod+shift+p", "mac");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(formatBinding(parsed.value, "mac")).toBe("⇧⌘P");
    expect(formatBinding(parsed.value, "win")).toBe("Ctrl+Shift+P");
  });
});

describe("evaluateWhen", () => {
  it("evaluates boolean and string equality", () => {
    expect(evaluateWhen("chat.running", { "chat.running": true })).toBe(true);
    expect(evaluateWhen("!chat.running", { "chat.running": true })).toBe(false);
    expect(
      evaluateWhen("focus.panel == 'chat.composer'", {
        "focus.panel": "chat.composer",
      }),
    ).toBe(true);
    expect(
      evaluateWhen("chat.composerNotEmpty && !chat.submitDisabled", {
        "chat.composerNotEmpty": true,
        "chat.submitDisabled": false,
      }),
    ).toBe(true);
  });
});

describe("mergeKeybindingLayers", () => {
  it("applies unbind then user positive", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [
        { key: "mod+k", command: "-palette.open" },
        { key: "ctrl+shift+p", command: "palette.open" },
      ],
      platform: "mac",
    });

    const palette = rules.filter((rule) => rule.command === "palette.open");
    expect(palette.some((rule) => rule.key === "mod+k")).toBe(false);
    expect(palette.some((rule) => rule.key === "ctrl+shift+p")).toBe(true);
    expect(palette.some((rule) => rule.key === "mod+shift+p")).toBe(true);
  });
});

describe("user-delta revision A", () => {
  it("replaces a default key with negative + positive", () => {
    const defaults = createDefaultKeybindingRules();
    const effective = listEffectiveBindings({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
      commandId: COMMAND_IDS.paletteOpen,
    }).find((binding) => binding.key === "mod+k");

    expect(effective).toBeDefined();
    const next = replaceEffectiveBinding([], effective!, "ctrl+shift+p");
    expect(next).toEqual(
      expect.arrayContaining([
        { key: "mod+k", command: "-palette.open" },
        { key: "ctrl+shift+p", command: "palette.open" },
      ]),
    );
  });

  it("appends without unbinding and detects duplicates", () => {
    const defaults = createDefaultKeybindingRules();
    const effective = listEffectiveBindings({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
      commandId: COMMAND_IDS.paletteOpen,
    });
    const appended = appendUserBinding(
      [],
      COMMAND_IDS.paletteOpen,
      "alt+p",
      undefined,
      effective,
    );
    expect(appended.alreadyExists).toBe(false);
    expect(appended.entries).toEqual([
      { key: "alt+p", command: "palette.open" },
    ]);

    const again = appendUserBinding(
      appended.entries,
      COMMAND_IDS.paletteOpen,
      "mod+k",
      undefined,
      listEffectiveBindings({
        defaultRules: defaults,
        userEntries: appended.entries,
        platform: "mac",
        commandId: COMMAND_IDS.paletteOpen,
      }),
    );
    expect(again.alreadyExists).toBe(true);
  });

  it("removes default via negative binding", () => {
    const defaults = createDefaultKeybindingRules();
    const effective = listEffectiveBindings({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
      commandId: COMMAND_IDS.paletteOpen,
    }).find((binding) => binding.key === "mod+k")!;
    const next = removeEffectiveBinding([], effective);
    expect(next).toEqual([{ key: "mod+k", command: "-palette.open" }]);
  });
});

describe("findConflicts", () => {
  it("reports shadowed same-key bindings", () => {
    const { rules } = mergeKeybindingLayers({
      defaultRules: createDefaultKeybindingRules(),
      userEntries: [{ key: "mod+k", command: "chat.new" }],
      platform: "mac",
    });
    const conflicts = findConflicts(rules, "mac");
    expect(
      conflicts.some(
        (conflict) => conflict.key === "mod+k" && conflict.kind === "shadowed",
      ),
    ).toBe(true);
  });
});
