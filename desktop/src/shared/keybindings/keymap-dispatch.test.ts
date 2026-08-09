/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COMMAND_IDS } from "./commands";
import { createDefaultKeybindingRules } from "./default-bindings";
import { mergeKeybindingLayers, inheritRuleMeta } from "./merge-bindings";
import { resolveActiveKeymapFocus } from "./active-scopes";
import type { ContextKeyValues } from "./types";

// Import engine pieces via relative paths that match desktop test roots
import {
  loadKeymap,
  dispatchKeyEvent,
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

  beforeEach(() => {
    // clean handlers between tests by re-registering
  });

  afterEach(() => {
    while (disposables.length > 0) disposables.pop()?.();
  });

  it("claims palette.open and cancels default before handler completes", () => {
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
      focus: {
        scopes: new Set(["app", "window"]),
        captureZoneId: null,
        nearestScopeId: null,
        focusEditable: false,
      },
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
      focus: {
        scopes: new Set(["app", "window", "panel", "editable"]),
        captureZoneId: "chat.composer",
        nearestScopeId: "chat.composer",
        focusEditable: true,
      },
    });

    expect(result).toEqual({ kind: "claimed", command: COMMAND_IDS.chatSend });
    expect(prevented.value).toBe(true);
    expect(sent).toBe(true);
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
      // No panel scope — e.g. focus on fleet sidebar outside chat
      focus: {
        scopes: new Set(["app", "window"]),
        captureZoneId: null,
        nearestScopeId: null,
        focusEditable: false,
      },
    });

    expect(result.kind).toBe("ignored");
    expect(prevented.value).toBe(false);
    expect(interrupted).toBe(false);
  });

  it("fires panel interrupt when panel scope is active and not in composer capture", () => {
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
      focus: {
        scopes: new Set(["app", "window", "panel"]),
        captureZoneId: null,
        nearestScopeId: "chat.panel",
        focusEditable: false,
      },
    });

    expect(result).toEqual({
      kind: "claimed",
      command: COMMAND_IDS.chatInterrupt,
    });
    expect(prevented.value).toBe(true);
    expect(interrupted).toBe(true);
  });
});

describe("resolveActiveKeymapFocus", () => {
  it("collects scope chain and capture zone from DOM", () => {
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
    expect(focus.focusEditable).toBe(true);

    root.remove();
  });
});
