import type { CommandDescriptor, CommandId } from "./types";

export const COMMAND_IDS = {
  paletteOpen: "palette.open",
  paletteClose: "palette.close",
  chatSend: "chat.send",
  chatInterrupt: "chat.interrupt",
  chatNew: "chat.new",
  chatNewline: "chat.newline",
  chatFocusComposer: "chat.focusComposer",
  chatRemoveLastAttachment: "chat.removeLastAttachment",
  workspaceToggleSidebar: "workspace.toggleSidebar",
  workspaceNewTab: "workspace.newTab",
  workspaceCloseTab: "workspace.closeTab",
  workspaceNextTab: "workspace.nextTab",
  workspacePreviousTab: "workspace.previousTab",
  filesSave: "files.save",
  settingsOpen: "settings.open",
} as const satisfies Record<string, CommandId>;

export const COMMAND_DESCRIPTORS: readonly CommandDescriptor[] = [
  {
    id: COMMAND_IDS.paletteOpen,
    titleKey: "commands.paletteOpen",
    categoryKey: "commands.categories.app",
    bindable: true,
    handlerScope: "app",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.paletteClose,
    titleKey: "commands.paletteClose",
    categoryKey: "commands.categories.app",
    when: "palette.open",
    bindable: true,
    handlerScope: "app",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.chatSend,
    titleKey: "commands.chatSend",
    categoryKey: "commands.categories.chat",
    when: "chat.composerNotEmpty && !chat.submitDisabled",
    bindable: true,
    handlerScope: "editable",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.chatInterrupt,
    titleKey: "commands.chatInterrupt",
    categoryKey: "commands.categories.chat",
    when: "chat.running",
    bindable: true,
    handlerScope: "panel",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.chatNew,
    titleKey: "commands.chatNew",
    categoryKey: "commands.categories.chat",
    bindable: true,
    handlerScope: "app",
    invocableFromMain: true,
  },
  {
    id: COMMAND_IDS.chatNewline,
    titleKey: "commands.chatNewline",
    categoryKey: "commands.categories.chat",
    when: "focus.panel == 'chat.composer'",
    bindable: true,
    handlerScope: "editable",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.chatFocusComposer,
    titleKey: "commands.chatFocusComposer",
    categoryKey: "commands.categories.chat",
    when: "view.id == 'workspace'",
    bindable: true,
    handlerScope: "window",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.chatRemoveLastAttachment,
    titleKey: "commands.chatRemoveLastAttachment",
    categoryKey: "commands.categories.chat",
    when: "chat.composerEmpty && chat.hasAttachment",
    bindable: true,
    handlerScope: "editable",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.workspaceToggleSidebar,
    titleKey: "commands.workspaceToggleSidebar",
    categoryKey: "commands.categories.view",
    bindable: true,
    handlerScope: "window",
    invocableFromMain: true,
  },
  {
    id: COMMAND_IDS.workspaceNewTab,
    titleKey: "commands.workspaceNewTab",
    categoryKey: "commands.categories.view",
    when: "workspace.powerMode",
    bindable: true,
    handlerScope: "view",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.workspaceCloseTab,
    titleKey: "commands.workspaceCloseTab",
    categoryKey: "commands.categories.view",
    when: "workspace.powerMode && workspace.hasClosableTab",
    bindable: true,
    handlerScope: "view",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.workspaceNextTab,
    titleKey: "commands.workspaceNextTab",
    categoryKey: "commands.categories.view",
    when: "workspace.hasMultipleTabs",
    bindable: true,
    handlerScope: "view",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.workspacePreviousTab,
    titleKey: "commands.workspacePreviousTab",
    categoryKey: "commands.categories.view",
    when: "workspace.hasMultipleTabs",
    bindable: true,
    handlerScope: "view",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.filesSave,
    titleKey: "commands.filesSave",
    categoryKey: "commands.categories.files",
    when: "files.activeDirty",
    bindable: true,
    handlerScope: "view",
    invocableFromMain: false,
  },
  {
    id: COMMAND_IDS.settingsOpen,
    titleKey: "commands.settingsOpen",
    categoryKey: "commands.categories.app",
    bindable: true,
    handlerScope: "app",
    invocableFromMain: true,
  },
];

const descriptorById = new Map(
  COMMAND_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]),
);

export function getCommandDescriptor(
  id: CommandId,
): CommandDescriptor | undefined {
  return descriptorById.get(id);
}

export function isKnownCommandId(id: string): id is CommandId {
  return descriptorById.has(id);
}

export function stripUnbindPrefix(command: string): {
  unbind: boolean;
  id: CommandId;
} {
  if (command.startsWith("-")) {
    return { unbind: true, id: command.slice(1) };
  }
  return { unbind: false, id: command };
}
