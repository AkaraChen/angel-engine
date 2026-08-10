import type { KeybindingRule, KeymapPlatform } from "./types";
import { COMMAND_IDS } from "./commands";

const COMPOSER_WHEN = "focus.panel == 'chat.composer' && !chat.suggestionOpen";

/** Built-in default keybindings (KIT-796 §4 + interrupt composer product decision). */
export function createDefaultKeybindingRules(
  options: { sendWithModEnter?: boolean } = {},
): KeybindingRule[] {
  const sendWithModEnter = options.sendWithModEnter ?? false;

  const sendEnter: KeybindingRule = {
    key: "enter",
    command: COMMAND_IDS.chatSend,
    when: COMPOSER_WHEN,
    editableBehavior: "allow",
    owner: "chat.composer",
    source: "default",
  };
  const sendModEnter: KeybindingRule = {
    key: "mod+enter",
    command: COMMAND_IDS.chatSend,
    when: COMPOSER_WHEN,
    editableBehavior: "allow",
    owner: "chat.composer",
    source: "default",
  };
  const newlineShiftEnter: KeybindingRule = {
    key: "shift+enter",
    command: COMMAND_IDS.chatNewline,
    when: COMPOSER_WHEN,
    editableBehavior: "allow",
    owner: "chat.composer",
    source: "default",
  };
  const newlineEnter: KeybindingRule = {
    key: "enter",
    command: COMMAND_IDS.chatNewline,
    when: COMPOSER_WHEN,
    editableBehavior: "allow",
    owner: "chat.composer",
    source: "default",
  };

  return [
    {
      key: "mod+k",
      command: COMMAND_IDS.paletteOpen,
      source: "default",
    },
    {
      key: "mod+shift+p",
      command: COMMAND_IDS.paletteOpen,
      source: "default",
    },
    {
      key: "escape",
      command: COMMAND_IDS.paletteClose,
      when: "palette.open",
      source: "default",
    },
    ...(sendWithModEnter
      ? [sendModEnter, newlineEnter, newlineShiftEnter]
      : [sendEnter, sendModEnter, newlineShiftEnter]),
    {
      key: "escape",
      command: COMMAND_IDS.chatInterrupt,
      when: "chat.running && !chat.suggestionOpen",
      editableBehavior: "allow",
      owner: "chat.composer",
      source: "default",
    },
    {
      key: "escape",
      command: COMMAND_IDS.chatInterrupt,
      when: "chat.running",
      editableBehavior: "allow",
      owner: "chat.panel",
      source: "default",
    },
    {
      key: "mod+.",
      command: COMMAND_IDS.chatInterrupt,
      when: "chat.running",
      source: "default",
    },
    {
      key: "mod+n",
      command: COMMAND_IDS.chatNew,
      source: "default",
    },
    {
      key: "mod+l",
      command: COMMAND_IDS.chatFocusComposer,
      when: "view.id == 'workspace'",
      source: "default",
    },
    {
      key: "backspace",
      command: COMMAND_IDS.chatRemoveLastAttachment,
      when: "chat.composerEmpty && chat.hasAttachment && focus.panel == 'chat.composer'",
      editableBehavior: "allow",
      owner: "chat.composer",
      source: "default",
    },
    {
      key: "mod+b",
      command: COMMAND_IDS.workspaceToggleSidebar,
      source: "default",
    },
    {
      key: "mod+t",
      command: COMMAND_IDS.workspaceNewTab,
      when: "workspace.powerMode",
      source: "default",
    },
    {
      key: "mod+w",
      command: COMMAND_IDS.workspaceCloseTab,
      when: "workspace.powerMode && workspace.hasClosableTab",
      source: "default",
    },
    {
      key: "ctrl+tab",
      command: COMMAND_IDS.workspaceNextTab,
      when: "workspace.hasMultipleTabs",
      source: "default",
    },
    {
      key: "ctrl+shift+tab",
      command: COMMAND_IDS.workspacePreviousTab,
      when: "workspace.hasMultipleTabs",
      source: "default",
    },
    {
      key: "mod+s",
      command: COMMAND_IDS.filesSave,
      when: "files.activeDirty",
      owner: "workspace.files",
      source: "default",
    },
    {
      key: "mod+,",
      command: COMMAND_IDS.settingsOpen,
      platform: ["mac"] satisfies KeymapPlatform[],
      source: "default",
    },
    {
      key: "ctrl+,",
      command: COMMAND_IDS.settingsOpen,
      platform: ["win", "linux"] satisfies KeymapPlatform[],
      source: "default",
    },
  ];
}
