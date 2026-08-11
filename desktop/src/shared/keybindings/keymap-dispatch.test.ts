/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";

import { resolveActiveKeymapFocus } from "./active-scopes";
import { COMMAND_IDS } from "./commands";
import { createDefaultKeybindingRules } from "./default-bindings";
import { inheritRuleMeta, mergeKeybindingLayers } from "./merge-bindings";
import type { ContextKeyValues } from "./types";
import {
  dispatchKeyEvent,
  loadKeymap,
} from "../../renderer/platform/keymap/keymap-engine";
import { commandRegistry } from "../../renderer/platform/keymap/registry";

function makeKeyEvent(partial: {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
  isComposing?: boolean;
  repeat?: boolean;
}) {
  const prevented = { value: false };
  const stopped = { value: false };
  const event = {
    key: partial.key,
    code: partial.code ?? `Key${partial.key.toUpperCase()}`,
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    isComposing: partial.isComposing ?? false,
    keyCode: 0,
    repeat: partial.repeat ?? false,
    target: partial.target ?? null,
    preventDefault() {
      prevented.value = true;
    },
    stopPropagation() {
      stopped.value = true;
    },
  };
  return { event, prevented, stopped };
}

function emptyFocus(
  overrides: Partial<ReturnType<typeof resolveActiveKeymapFocus>> = {},
) {
  return {
    scopes: new Set(["app", "window"] as const),
    scopeIds: new Map(),
    captureZoneId: null,
    nearestScopeId: null,
    focusEditable: false,
    ...overrides,
  };
}

describe("user rebind preserves owner/editableBehavior", () => {
  it("inherits composer owner for chat.send after rebind", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [
        {
          key: "enter",
          command: "-chat.send",
          when: "focus.panel == 'chat.composer' && !chat.suggestionOpen",
        },
        {
          key: "mod+enter",
          command: "chat.send",
          when: "focus.panel == 'chat.composer' && !chat.suggestionOpen",
        },
      ],
      platform: "mac",
    });

    const rebound = rules.find(
      (rule) =>
        rule.command === COMMAND_IDS.chatSend &&
        rule.source === "user" &&
        rule.key === "mod+enter",
    );
    expect(rebound?.owner).toBe("chat.composer");
    expect(rebound?.editableBehavior).toBe("allow");
  });

  it("inheritRuleMeta prefers matching when", () => {
    const defaults = createDefaultKeybindingRules();
    const meta = inheritRuleMeta(
      COMMAND_IDS.chatInterrupt,
      "chat.running && !chat.suggestionOpen",
      defaults,
    );
    expect(meta.owner).toBe("chat.composer");
  });
});

describe("dispatchKeyEvent sync preventDefault + user rebind", () => {
  const disposables: Array<() => void> = [];

  afterEach(() => {
    while (disposables.length > 0) disposables.pop()?.();
  });

  it("claims palette.open and cancels default before handler returns", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let handlerStarted = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.paletteOpen, () => {
        handlerStarted = true;
        return true;
      }),
    );

    const { event, prevented, stopped } = makeKeyEvent({
      key: "k",
      code: "KeyK",
      metaKey: true,
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context: {},
      state: { chordPending: null, recording: false },
      focus: emptyFocus(),
    });

    expect(result.kind).toBe("claimed");
    expect(prevented.value).toBe(true);
    expect(stopped.value).toBe(true);
    expect(handlerStarted).toBe(true);
  });

  it("dispatches user-rebound chat.send inside composer capture zone", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [
        {
          key: "enter",
          command: "-chat.send",
          when: "focus.panel == 'chat.composer' && !chat.suggestionOpen",
        },
        {
          key: "mod+p",
          command: "chat.send",
          when: "focus.panel == 'chat.composer' && !chat.suggestionOpen",
        },
      ],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let sent = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.chatSend, () => {
        sent = true;
        return true;
      }),
    );

    const context: ContextKeyValues = {
      "focus.panel": "chat.composer",
      "chat.composerNotEmpty": true,
      "chat.submitDisabled": false,
      "chat.suggestionOpen": false,
    };

    const { event, prevented } = makeKeyEvent({
      key: "p",
      code: "KeyP",
      metaKey: true,
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context,
      state: { chordPending: null, recording: false },
      focus: emptyFocus({
        scopes: new Set(["app", "window", "panel", "editable"]),
        scopeIds: new Map([
          ["panel", new Set(["chat.panel"])],
          ["editable", new Set(["chat.composer"])],
        ]),
        captureZoneId: "chat.composer",
        nearestScopeId: "chat.composer",
        focusEditable: true,
      }),
    });

    expect(result).toEqual({ kind: "claimed", command: COMMAND_IDS.chatSend });
    expect(prevented.value).toBe(true);
    expect(sent).toBe(true);
  });

  it("falls through when handler returns false (E4)", () => {
    const defaults = createDefaultKeybindingRules();
    // Two commands on same key via user layer
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [
        { key: "mod+k", command: "-palette.open" },
        { key: "mod+k", command: "chat.new" },
        { key: "mod+k", command: "palette.open" },
      ],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let chatNewCalled = false;
    let paletteCalled = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.chatNew, () => {
        chatNewCalled = true;
        return false;
      }),
    );
    disposables.push(
      commandRegistry.register(COMMAND_IDS.paletteOpen, () => {
        paletteCalled = true;
        return true;
      }),
    );

    const { event, prevented } = makeKeyEvent({
      key: "k",
      code: "KeyK",
      metaKey: true,
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context: {},
      state: { chordPending: null, recording: false },
      focus: emptyFocus(),
    });

    expect(chatNewCalled).toBe(true);
    expect(paletteCalled).toBe(true);
    expect(result).toEqual({
      kind: "claimed",
      command: COMMAND_IDS.paletteOpen,
    });
    expect(prevented.value).toBe(true);
  });

  it("does not fire panel interrupt when panel scope is inactive", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let interrupted = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.chatInterrupt, () => {
        interrupted = true;
        return true;
      }),
    );

    const { event, prevented } = makeKeyEvent({
      key: "Escape",
      code: "Escape",
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context: { "chat.running": true },
      state: { chordPending: null, recording: false },
      focus: emptyFocus(),
    });

    expect(result.kind).toBe("ignored");
    expect(prevented.value).toBe(false);
    expect(interrupted).toBe(false);
  });

  it("does not interrupt when focus is in another panel", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let interrupted = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.chatInterrupt, () => {
        interrupted = true;
        return true;
      }),
    );

    const { event, prevented } = makeKeyEvent({
      key: "Escape",
      code: "Escape",
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context: { "chat.running": true },
      state: { chordPending: null, recording: false },
      focus: emptyFocus({
        scopes: new Set(["app", "window", "panel"]),
        // Different panel id — must not match owner chat.panel
        scopeIds: new Map([["panel", new Set(["files.panel"])]]),
        nearestScopeId: "files.panel",
      }),
    });

    expect(result.kind).toBe("ignored");
    expect(prevented.value).toBe(false);
    expect(interrupted).toBe(false);
  });

  it("fires panel interrupt when chat.panel scope id is active", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let interrupted = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.chatInterrupt, () => {
        interrupted = true;
        return true;
      }),
    );

    const { event, prevented } = makeKeyEvent({
      key: "Escape",
      code: "Escape",
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context: { "chat.running": true },
      state: { chordPending: null, recording: false },
      focus: emptyFocus({
        scopes: new Set(["app", "window", "panel"]),
        scopeIds: new Map([["panel", new Set(["chat.panel"])]]),
        nearestScopeId: "chat.panel",
      }),
    });

    expect(result).toEqual({
      kind: "claimed",
      command: COMMAND_IDS.chatInterrupt,
    });
    expect(prevented.value).toBe(true);
    expect(interrupted).toBe(true);
  });

  it("closes settings with mod+w when view.id is settings (KIT-853)", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let closed = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.settingsClose, () => {
        closed = true;
        return true;
      }),
    );

    const { event, prevented } = makeKeyEvent({
      key: "w",
      code: "KeyW",
      metaKey: true,
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context: { "view.id": "settings" },
      state: { chordPending: null, recording: false },
      focus: emptyFocus(),
    });

    expect(result).toEqual({
      kind: "claimed",
      command: COMMAND_IDS.settingsClose,
    });
    expect(prevented.value).toBe(true);
    expect(closed).toBe(true);
  });

  it("does not claim mod+w for settings.close outside the settings window", () => {
    const defaults = createDefaultKeybindingRules();
    const { rules } = mergeKeybindingLayers({
      defaultRules: defaults,
      userEntries: [],
      platform: "mac",
    });
    const keymap = loadKeymap({ rules, platform: "mac" });

    let closed = false;
    disposables.push(
      commandRegistry.register(COMMAND_IDS.settingsClose, () => {
        closed = true;
        return true;
      }),
    );

    const { event, prevented } = makeKeyEvent({
      key: "w",
      code: "KeyW",
      metaKey: true,
    });

    const result = dispatchKeyEvent({
      event,
      keymap,
      context: { "view.id": "workspace" },
      state: { chordPending: null, recording: false },
      focus: emptyFocus(),
    });

    expect(result.kind).toBe("ignored");
    expect(prevented.value).toBe(false);
    expect(closed).toBe(false);
  });
});

describe("resolveActiveKeymapFocus", () => {
  it("collects scope chain, ids, and capture zone from DOM", () => {
    const root = document.createElement("div");
    root.setAttribute("data-keymap-scope", "view");
    root.setAttribute("data-keymap-scope-id", "workspace");

    const panel = document.createElement("div");
    panel.setAttribute("data-keymap-scope", "panel");
    panel.setAttribute("data-keymap-scope-id", "chat.panel");

    const capture = document.createElement("div");
    capture.setAttribute("data-keymap-scope", "editable");
    capture.setAttribute("data-keymap-scope-id", "chat.composer");
    capture.setAttribute("data-keymap-capture", "chat.composer");

    const input = document.createElement("textarea");

    capture.appendChild(input);
    panel.appendChild(capture);
    root.appendChild(panel);
    document.body.appendChild(root);

    const focus = resolveActiveKeymapFocus(input);
    expect(focus.captureZoneId).toBe("chat.composer");
    expect(focus.scopes.has("view")).toBe(true);
    expect(focus.scopes.has("panel")).toBe(true);
    expect(focus.scopes.has("editable")).toBe(true);
    expect(focus.scopeIds.get("panel")?.has("chat.panel")).toBe(true);
    expect(focus.scopeIds.get("view")?.has("workspace")).toBe(true);
    expect(focus.focusEditable).toBe(true);

    root.remove();
  });
});
